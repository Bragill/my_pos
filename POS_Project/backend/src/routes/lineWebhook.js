const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../database/dbHelper');
const lineService = require('../services/lineService');
const { executeApprovedAction } = require('../services/approvalService');
const { buildApprovalResultFlex } = require('../services/lineFlexTemplates');

/**
 * LINE Webhook Handler
 * Verified via x-line-signature
 */
router.post('/', async (req, res) => {
  try {
    const signature = req.headers['x-line-signature'];
    
    // Cloudflare Workers / Express body raw buffer or string
    const rawBody = req.rawBody || JSON.stringify(req.body);

    const { events } = req.body || {};
    if (!events || !Array.isArray(events)) {
      return res.status(200).send('OK');
    }

    for (const event of events) {
      const source = event.source || {};
      const groupId = source.groupId || source.roomId || null;
      const userId = source.userId || null;
      const msgText = event.message?.text || (event.postback?.data ? `[Postback] ${event.postback.data}` : null);

      console.log(`[LINE Webhook Event] type=${event.type}, groupId=${groupId || 'none'}, userId=${userId || 'none'}`);
      console.log(`[LINE Webhook Full Event]`, JSON.stringify(event));

      // Record event into line_webhook_events for auto-detection in POS settings
      if (groupId || userId) {
        try {
          await db.run(
            `INSERT INTO line_webhook_events (id, event_type, group_id, user_id, message_text) VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), event.type, groupId, userId, msgText]
          );
        } catch (dbErr) {
          console.warn('[LINE Webhook] Failed to record event:', dbErr.message);
        }
      }

      // 1. Check if bot was added/joined to a group, or user sends a message asking for ID
      if (event.type === 'join' || (event.type === 'message' && event.message?.type === 'text')) {
        const text = (event.message?.text || '').trim().toLowerCase();
        const shouldReplyId = event.type === 'join' || text === 'id' || text === 'groupid' || text === 'group id' || text === 'ไอดี' || text === 'ขอไอดี';

        if (shouldReplyId && event.replyToken) {
          const storeSettings = await db.all('SELECT channel_access_token FROM line_settings WHERE channel_access_token IS NOT NULL LIMIT 1');
          const token = storeSettings?.[0]?.channel_access_token;

          if (token) {
            const replyTexts = [];
            if (groupId) {
              replyTexts.push(`🆔 Group ID ของกลุ่มนี้คือ:\n${groupId}\n\n(สามารถคัดลอกไปใส่ในช่อง Target Group ID ในหน้าตั้งค่า POS ได้เลยครับ)`);
            } else if (userId) {
              replyTexts.push(`🆔 User ID ของคุณคือ:\n${userId}\n\n(สามารถคัดลอกไปใส่ในช่อง Target Group ID ในหน้าตั้งค่า POS ได้เลยครับ)`);
            }

            if (replyTexts.length > 0) {
              await lineService.replyMessage(token, event.replyToken, {
                type: 'text',
                text: replyTexts.join('\n\n')
              });
              continue;
            }
          }
        }
      }

      // 2. Handle Postback Event (Approve/Reject button pressed)
      if (event.type === 'postback' && event.postback?.data) {
        const queryParams = new URLSearchParams(event.postback.data);
        const action = queryParams.get('action'); // 'approve' or 'reject'
        const approvalId = queryParams.get('id');

        if (!approvalId || !action) continue;

        const approval = await db.get('SELECT * FROM approval_requests WHERE id = ?', [approvalId]);
        if (!approval) {
          console.warn(`[LINE Webhook] Approval request #${approvalId} not found`);
          continue;
        }

        const settings = await db.get('SELECT * FROM line_settings WHERE store_id = ?', [approval.store_id]);
        const channelAccessToken = settings?.channel_access_token;

        // Verify channel secret signature if available
        if (settings?.channel_secret && signature) {
          const isValid = lineService.verifySignature(rawBody, signature, settings.channel_secret);
          if (!isValid) {
            console.warn('[LINE Webhook] Invalid signature received');
          }
        }

        // Check if already processed
        if (approval.status !== 'PENDING') {
          if (event.replyToken && channelAccessToken) {
            await lineService.replyMessage(channelAccessToken, event.replyToken, {
              type: 'text',
              text: `⚠️ คำขอนี้ได้รับการดำเนินการไปแล้ว (สถานะปัจจุบัน: ${approval.status === 'APPROVED' ? 'อนุมัติแล้ว' : 'ปฏิเสธแล้ว'}) โดย ${approval.approver_name || 'ผู้จัดการ'}`
            });
          }
          continue;
        }

        const responderUserId = event.source?.userId || 'unknown';
        let approverDisplayName = 'ผู้จัดการร้าน';

        // Try getting user profile from LINE if channel access token is present
        if (channelAccessToken && responderUserId !== 'unknown') {
          try {
            const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${responderUserId}`, {
              headers: { Authorization: `Bearer ${channelAccessToken}` }
            });
            if (profileRes.ok) {
              const profile = await profileRes.json();
              approverDisplayName = profile.displayName || approverDisplayName;
            }
          } catch (_) {}
        }

        const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
        const nowBkk = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

        // Update approval record
        await db.run(
          "UPDATE approval_requests SET status = ?, approver_name = ?, approver_line_user_id = ?, responded_at = datetime('now', '+7 hours') WHERE id = ?",
          [newStatus, approverDisplayName, responderUserId, approvalId]
        );

        approval.status = newStatus;
        approval.approver_name = approverDisplayName;

        // 1. Send reply confirming decision IMMEDIATELY while replyToken is fresh
        if (channelAccessToken) {
          const resultFlex = buildApprovalResultFlex({
            documentId: approval.document_id,
            documentType: approval.document_type,
            status: newStatus,
            responderName: approverDisplayName,
            respondedAt: nowBkk
          });

          let replied = false;
          if (event.replyToken) {
            try {
              await lineService.replyMessage(channelAccessToken, event.replyToken, resultFlex);
              replied = true;
            } catch (replyErr) {
              console.warn('[LINE Webhook] replyMessage failed, will attempt pushMessage fallback:', replyErr.message);
            }
          }

          // Fallback to pushMessage if replyMessage was not sent or failed
          if (!replied) {
            const targetRecipient = groupId || userId || settings?.target_group_id;
            if (targetRecipient) {
              try {
                await lineService.pushMessage(channelAccessToken, targetRecipient, resultFlex);
              } catch (pushErr) {
                console.error('[LINE Webhook] Failed to push resultFlex fallback:', pushErr.message);
              }
            }
          }
        }

        // 2. Execute action if approved or revert status if rejected
        if (newStatus === 'APPROVED') {
          try {
            await executeApprovedAction(approval);
          } catch (execErr) {
            console.error('[LINE Webhook] Action execution failed:', execErr.message);
            try {
              if (approval.document_type === 'sale_void') {
                await db.run(
                  "UPDATE orders SET status = 'ยกเลิกแล้ว', approver_name = ?, approved_at = datetime('now', '+7 hours'), updated_at = datetime('now', '+7 hours') WHERE (id = ? OR order_no = ?)",
                  [approverDisplayName, approval.document_id, approval.document_id]
                );
              } else if (approval.document_type === 'po_cancel' || approval.document_type === 'goods_receipt') {
                await db.run(
                  "UPDATE purchase_orders SET status = 'cancelled', approver_name = ?, approved_at = datetime('now', '+7 hours') WHERE (id = ? OR po_number = ?)",
                  [approverDisplayName, approval.document_id, approval.document_id]
                );
              } else if (approval.document_type === 'wo_cancel' || approval.document_type === 'production_order') {
                await db.run(
                  "UPDATE work_orders SET status = 'cancelled', approver_name = ?, approved_at = datetime('now', '+7 hours') WHERE (id = ? OR wo_number = ?)",
                  [approverDisplayName, approval.document_id, approval.document_id]
                );
              }
            } catch (fallbackErr) {
              console.error('[LINE Webhook] Fallback status update failed:', fallbackErr.message);
            }
          }
        } else if (newStatus === 'REJECTED') {
          try {
            const rejectNotice = `[ปฏิเสธยกเลิกโดย ${approverDisplayName} เมื่อ ${nowBkk}]`;
            if (approval.document_type === 'sale_void') {
              await db.run(
                "UPDATE orders SET status = 'completed', remark = COALESCE(remark || ' | ', '') || ?, updated_at = datetime('now', '+7 hours') WHERE (id = ? OR order_no = ?)",
                [rejectNotice, approval.document_id, approval.document_id]
              );
            } else if (approval.document_type === 'po_cancel' || approval.document_type === 'goods_receipt') {
              await db.run(
                "UPDATE purchase_orders SET status = 'completed', remark = COALESCE(remark || ' | ', '') || ? WHERE (id = ? OR po_number = ?)",
                [rejectNotice, approval.document_id, approval.document_id]
              );
            } else if (approval.document_type === 'wo_cancel' || approval.document_type === 'production_order') {
              await db.run(
                "UPDATE work_orders SET status = 'completed', remark = COALESCE(remark || ' | ', '') || ? WHERE (id = ? OR wo_number = ?)",
                [rejectNotice, approval.document_id, approval.document_id]
              );
            } else if (approval.document_type === 'device_unlock') {
              await db.run(
                "UPDATE device_security SET status = 'BLACKLISTED', updated_at = datetime('now', '+7 hours') WHERE mac_address = ?",
                [approval.document_id]
              );
            }
          } catch (rejErr) {
            console.error('[LINE Webhook] Failed to revert document status on reject:', rejErr.message);
          }
        }
      }
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('[LINE Webhook Error]', err);
    return res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
