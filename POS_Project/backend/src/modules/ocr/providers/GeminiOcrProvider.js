const https = require('https');
const BaseOcrProvider = require('./BaseOcrProvider');

class GeminiOcrProvider extends BaseOcrProvider {
    constructor() {
        super();
        this.apiKey = process.env.GEMINI_API_KEY;
    }

    async extract(imageBuffer, mimetype, retryCount = 0) {
        const MAX_RETRIES = 3;
        const prompt = `
            Extract structured data from this Thai receipt image. 
            Focus on Thai language accuracy for Vendor, Date, and Items.
            
            PAYMENT DETECTION:
            - Look for keywords like "Cash", "เงินสด" -> Result: "Cash"
            - Look for "QR", "สแกน", "Thai QR", "PromptPay" -> Result: "QR"
            - Look for "Credit Card", "บัตรเครดิต", "VISA", "Mastercard" -> Result: "Credit Card"
            - Look for "Transfer", "โอนเงิน" -> Result: "Transfer"
            
            TRANSACTION ID DETECTION:
            - Look for "เลขที่อ้างอิง", "Ref", "Txn ID", "Transaction ID", or long alphanumeric strings associated with the payment.

            Return ONLY a JSON object with this structure:
            {
                "vendor_name": "string",
                "receipt_date": "YYYY-MM-DD",
                "total_amount": number,
                "payment_method": "Cash | QR | Credit Card | Transfer | Unknown",
                "transaction_id": "string or null",
                "items": [
                    {
                        "raw_name": "string (Thai name as appearing on receipt)",
                        "quantity": number,
                        "unit_price": number,
                        "total_price": number
                    }
                ]
            }
        `;

        const requestBody = JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            data: imageBuffer.toString('base64'),
                            mimeType: mimetype,
                        },
                    }
                ]
            }]
        });

        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'generativelanguage.googleapis.com',
                path: `/v1beta/models/gemini-flash-latest:generateContent?key=${this.apiKey}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(requestBody)
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', async () => {
                    try {
                        const response = JSON.parse(data);
                        
                        // Handle High Demand / Rate Limit (503 / 429)
                        if ((res.statusCode === 503 || res.statusCode === 429) && retryCount < MAX_RETRIES) {
                            const delay = Math.pow(2, retryCount) * 1000;
                            console.warn(`[Gemini] High demand (${res.statusCode}), retrying in ${delay}ms... (Attempt ${retryCount + 1})`);
                            await new Promise(r => setTimeout(r, delay));
                            return resolve(this.extract(imageBuffer, mimetype, retryCount + 1));
                        }

                        if (res.statusCode !== 200) {
                            return reject(new Error(response.error?.message || `HTTP ${res.statusCode}`));
                        }

                        const text = response.candidates[0].content.parts[0].text;
                        const jsonMatch = text.match(/\{[\s\S]*\}/);
                        if (!jsonMatch) {
                            return reject(new Error('Failed to extract JSON from Gemini response'));
                        }
                        resolve(JSON.parse(jsonMatch[0]));
                    } catch (e) {
                        reject(new Error(`Failed to parse API response: ${e.message}`));
                    }
                });
            });

            req.on('error', (e) => reject(new Error(`API Request failed: ${e.message}`)));
            req.write(requestBody);
            req.end();
        });
    }

    getName() {
        return 'GeminiProvider';
    }
}

module.exports = GeminiOcrProvider;
