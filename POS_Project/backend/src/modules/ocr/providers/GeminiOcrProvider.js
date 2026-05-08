const https = require('https');
const BaseOcrProvider = require('./BaseOcrProvider');

class GeminiOcrProvider extends BaseOcrProvider {
    constructor() {
        super();
        this.apiKey = process.env.GEMINI_API_KEY;
        this.primaryModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        this.fallbackModel = 'gemini-2.5-flash-lite';
    }

    async extract(imageBuffer, mimetype, retryCount = 0, useFallback = false) {
        const MAX_RETRIES = 3;
        const currentModel = useFallback ? this.fallbackModel : this.primaryModel;
        
        const prompt = `
            Extract structured data from this Thai receipt image. 
            The receipt is typically from a Thai wholesaler (e.g., CP Axtra / Makro).
            
            STRICT OCR GUIDELINES:
            1. Perform high-precision OCR on Thai text. Tone marks (่ ้ ๊ ๋) and vowels (ิ ี ึ ื ุ ู) are critical. 
               - DO NOT hallucinate. If a word is unclear, try to read it character by character.
               - Example: If it says "ห่มหามงคล", do not return "มหาดุมผล".
            2. PRODUCT NAMES: Capture the 'raw_name' EXACTLY as it appears. 
               - If there is a SKU or code before/after the name, include it if it's on the same line.
               - Example: "เบียร์ช้างคลาสสิคใหญ่ 620มล.X15"
            3. NUMERIC DATA: 
               - 'quantity': The number of packs/units.
               - 'unit_price': Price per unit/pack.
               - 'total_price': quantity * unit_price.
            
            PAYMENT DETECTION:
            - "เงินสด" -> "Cash"
            - "QR", "สแกน", "PromptPay" -> "QR"
            - "บัตรเครดิต", "VISA", "Mastercard" -> "Credit Card"
            
            Return ONLY a JSON object:
            {
                "vendor_name": "string",
                "receipt_date": "YYYY-MM-DD",
                "total_amount": number,
                "payment_method": "Cash | QR | Credit Card | Transfer | Unknown",
                "transaction_id": "string or null",
                "items": [
                    {
                        "raw_name": "EXACT Thai text from receipt",
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
                path: `/v1/models/${currentModel}:generateContent?key=${this.apiKey}`,
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
                            const isHighDemand = res.statusCode === 503;
                            const nextRetryIsFallback = isHighDemand || useFallback;
                            
                            const delay = Math.pow(2, retryCount) * 1000;
                            console.warn(`[Gemini] ${isHighDemand ? 'High demand' : 'Rate limit'} (${res.statusCode}) on ${currentModel}. ` + 
                                         `Retrying with ${nextRetryIsFallback ? this.fallbackModel : this.primaryModel} in ${delay}ms... (Attempt ${retryCount + 1})`);
                            
                            await new Promise(r => setTimeout(r, delay));
                            return resolve(this.extract(imageBuffer, mimetype, retryCount + 1, nextRetryIsFallback));
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
