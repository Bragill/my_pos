const BaseOcrProvider = require('./BaseOcrProvider');

class MockOcrProvider extends BaseOcrProvider {
    async extract(imageBuffer, mimetype) {
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        return {
            vendor_name: '7-Eleven Mock Store',
            receipt_date: new Date().toISOString().split('T')[0],
            total_amount: 150.00,
            items: [
                {
                    raw_name: 'น้ำดื่มตราสิงห์ 600มล.',
                    quantity: 2,
                    unit_price: 7.00,
                    total_price: 14.00
                },
                {
                    raw_name: 'ขนมปังฟาร์มเฮ้าส์',
                    quantity: 1,
                    unit_price: 22.00,
                    total_price: 22.00
                },
                {
                    raw_name: 'เบียร์ลีโอ 630มล. แพ็ค 3',
                    quantity: 1,
                    unit_price: 114.00,
                    total_price: 114.00
                }
            ]
        };
    }

    getName() {
        return 'MockProvider';
    }
}

module.exports = MockOcrProvider;
