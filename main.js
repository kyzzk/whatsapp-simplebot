const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Carrega e serve o Swagger
let swaggerDocument;
try {
    swaggerDocument = YAML.load(path.join(__dirname, 'swagger.yaml'));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
    
    // Redireciona raiz para documentação
    app.get('/', (req, res) => {
        res.redirect('/api-docs');
    });
} catch (error) {
    console.error('Erro ao carregar swagger.yaml:', error);
    // Rota alternativa para a raiz caso o swagger falhe
    app.get('/', (req, res) => {
        res.json({ message: 'WhatsApp API is running' });
    });
}

// Create client instance with local auth
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

let qrCodeBase64 = '';
let isReady = false;

// When the client is ready
client.once('ready', () => {
    console.log('Client is ready!');
    isReady = true;
});

// When QR code is received
client.on('qr', async (qr) => {
    // Convert qr to base64 image
    qrCodeBase64 = await qrcode.toDataURL(qr);
    console.log('New QR Code generated');
});

// Initialize client
client.initialize();

// API Endpoints
app.get('/status', (req, res) => {
    res.json({ 
        connected: isReady,
        message: isReady ? 'WhatsApp is connected' : 'WhatsApp is not connected'
    });
});

app.get('/qrcode', (req, res) => {
    if (isReady) {
        return res.status(409).json({ error: 'WhatsApp is already connected' });
    }
    
    if (!qrCodeBase64) {
        console.log('QR Code not available, generating...');
        if (!client.pupPage) {
            client.initialize();
        }
        return setTimeout(() => {
            if (qrCodeBase64) {
                res.json({ qrcode: qrCodeBase64 });
            } else {
                res.status(404).json({ error: 'Failed to generate QR Code, please try again' });
            }
        }, 5000);
    }
    
    res.json({ qrcode: qrCodeBase64 });
});

app.post('/disconnect', async (req, res) => {
    try {
        await client.destroy();
        // Delete the auth data folder
        const authFolder = new LocalAuth().clientId ? 
            `.wwebjs_auth/session-${new LocalAuth().clientId}` : 
            '.wwebjs_auth/session';
        
        const fs = require('fs');
        
        if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
            console.log('Auth folder deleted successfully');
        }
        
        isReady = false;
        qrCodeBase64 = '';
        
        new Client({
            authStrategy: new LocalAuth()
        });
        res.json({ success: true, message: 'WhatsApp disconnected and auth data deleted' });
    } catch (error) {
        console.error('Error during disconnect:', error);
        res.status(500).json({ error: 'Failed to disconnect properly' });
    }
});

app.post('/send-message', async (req, res) => {
    try {
        if (!isReady) {
            return res.status(400).json({ error: 'WhatsApp is not connected' });
        }

        const { number, message, image_base64 } = req.body;

        if (!number || !message) {
            return res.status(400).json({ error: 'Number and message are required' });
        }

        const chat = await client.getChatById(number + '@c.us');
        
        if (image_base64) {
            const media = new MessageMedia('image/png', image_base64);
            await chat.sendMessage(media, { caption: message });
        } else {
            await chat.sendMessage(message);
        }

        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('Failed to send message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
});
