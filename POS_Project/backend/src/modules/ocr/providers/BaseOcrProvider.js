/**
 * @typedef {Object} ReceiptItem
 * @property {string} raw_name
 * @property {number} quantity
 * @property {number} unit_price
 * @property {number} total_price
 */

/**
 * @typedef {Object} ReceiptData
 * @property {string} vendor_name
 * @property {string} receipt_date
 * @property {number} total_amount
 * @property {ReceiptItem[]} items
 */

class BaseOcrProvider {
    /**
     * @param {Buffer} imageBuffer 
     * @param {string} mimetype
     * @returns {Promise<ReceiptData>}
     */
    async extract(imageBuffer, mimetype) {
        throw new Error('Method extract() must be implemented');
    }

    getName() {
        return 'BaseProvider';
    }
}

module.exports = BaseOcrProvider;
