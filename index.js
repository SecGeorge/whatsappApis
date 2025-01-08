const express = require('express');
const QRCode = require('qrcode');
const { Client, MessageMedia } = require('whatsapp-web.js');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;
const WebSocket = require('ws');



// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de multer para manejar imágenes
const upload = multer({ dest: 'uploads/' });

const wss = new WebSocket.Server({ port: 8082 });
console.log('Servidor WebSocket escuchando en ws://localhost:8082');


const client = new Client();

const wsClients = new Set();
wss.on('connection', (ws) => {
    console.log('Cliente conectado al WebSocket');
    wsClients.add(ws);
    ws.on('close', () => {
        console.log('Cliente desconectado del WebSocket');
        wsClients.delete(ws);
    });
    ws.on('error', (error) => console.error('Error en WebSocket:', error));
});

// Generar QR para conexión
client.on('qr', (qr) => {


    // Convertir el QR a base64
    QRCode.toDataURL(qr, (err, base64QR) => {
        if (err) {
            console.error('Error al generar QR en base64:', err);
            return;
        }
        
        // Enviar el QR en base64 a los clientes WebSocket
        wsClients.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ qr: base64QR })); // Enviar el QR en base64
            }
            console.log('QR recibido:', qr);
        });
    });
});
// Cliente listo
client.on('ready', () => {
    console.log('Cliente de WhatsApp está listo');

    // Notificar a los clientes WebSocket que el QR ha sido escaneado
    wsClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ message: 'QR_SCANNED' }));
        }
    });
});


client.initialize();

// Ruta para enviar mensajes de texto
app.get('/send-message', (req, res) => {
    const { number, message } = req.query;

    if (!number || !message) {
        return res.status(400).send({ status: 'Error', message: 'Número o mensaje faltante' });
    }

    const chatId = `${number}@c.us`;

    client.sendMessage(chatId, message)
        .then(response => res.send({ status: 'Mensaje enviado', response }))
        .catch(error => res.status(500).send({ status: 'Error', error }));
});

app.post('/send-mensaje', (req, res) => {
    const { telefono, mensaje } = req.body;
    const chatId = `${telefono}@c.us`;

    client.sendMessage(chatId, mensaje)
    .then(response => res.send({ status: 'Mensaje enviado', response }))
    .catch(error => res.send({ status: 'Error', error }));
    });

// Ruta para enviar imágenes
app.post('/send-image', upload.single('image'), (req, res) => {
    console.log('Solicitud recibida para /send-image');
    console.log('Cuerpo de la solicitud:', req.body);
    //console.log('Archivo recibido:', req.file);

    const { number, caption } = req.body;
    let imageBuffer;

    // Verificar si la imagen se recibió como archivo o en base64 en el body
    if (req.file) {
        // Si multer detecta un archivo, se usa como buffer
        imageBuffer = fs.readFileSync(req.file.path);
    } else if (req.body.image) {
        // Si viene como base64 en el body, se procesa
        imageBuffer = Buffer.from(req.body.image.split(',')[1], 'base64');
    } else {
        return res.status(400).send({ status: 'Error', message: 'No se ha enviado ninguna imagen' });
    }

    const chatId = `${number}@c.us`;
    const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'credencial.png');

    // Enviar la imagen y luego eliminar el archivo temporal (si existe)
    client.sendMessage(chatId, media, { caption: caption || 'Aquí está tu imagen' })
        .then(response => {
            console.log('Imagen enviada con éxito:', response);
            res.send({ status: 'Imagen enviada', response });
        })
        .catch(error => {
            console.error('Error al enviar la imagen:', error);
            res.status(500).send({ status: 'Error', error });
        })
        .finally(() => {
            if (req.file) {
                // Eliminar el archivo temporal creado por multer
                fs.unlinkSync(req.file.path);
            }
        });
});
// Escuchar en el puerto definido
app.listen(PORT, () => {
    console.log(`API de WhatsApp escuchando en http://localhost:${PORT}`);
});
