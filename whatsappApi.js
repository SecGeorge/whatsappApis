const wppconnect = require('@wppconnect-team/wppconnect');
const express = require('express');
const http = require('http'); // Cambiado a HTTP (Render maneja HTTPS automáticamente)
const WebSocket = require('ws');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de Multer para manejo de archivos temporales
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// Crear servidor HTTP (Render maneja HTTPS)
const server = http.createServer(app);''

// Configuración del servidor WebSocket
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Variable global para almacenar la instancia del cliente
let clientInstance = null;

// Función para enviar datos a los clientes conectados
const broadcast = (data) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
};

// Manejar conexiones WebSocket
wss.on('connection', (wsClient) => {
  console.log('Un nuevo cliente se ha conectado');
  wsClient.send(JSON.stringify({ message: 'Conectado al servidor' }));

  wsClient.on('message', (message) => {
    console.log('Mensaje recibido del cliente:', message);
  });

  wsClient.on('close', () => {
    console.log('Un cliente se ha desconectado');
  });

  wsClient.on('error', (error) => {
    console.error('Error en WebSocket:', error);
  });
});

// Inicializar WPPConnect
const initializeWPPConnect = () => {
  if (clientInstance !== null) {
    console.log('Ya hay una sesión activa, esperando a que se cierre...');
    return;
  }

  wppconnect.create({
    session: 'whatsapp-session',
    headless: true,
    useChrome: true,
    autoClose: false,
    disableSpins: true,
    catchQR: (base64Qr, asciiQR) => {
      console.log(asciiQR); // Log opcional para mostrar el QR en la terminal

      // Enviar el QR directamente a los clientes
      broadcast({ qr: base64Qr });
      console.log('QR enviado a los clientes');
    },
    logQR: false,
  })
    .then(client => {
      clientInstance = client;
      console.log('WPPConnect iniciado correctamente');

      client.onStateChange(state => {
        console.log('Estado de la sesión de WhatsApp:', state);

        if (state === 'CONNECTED') {
          console.log('Cliente conectado exitosamente');
          broadcast({ message: 'QR_SCANNED' });
        }
      });

      client.onLogout(() => {
        console.log('Sesión cerrada');
        clientInstance = null;
      });
    })
    .catch(error => {
      console.error('Error inicializando WPPConnect:', error);
    });
};

initializeWPPConnect();

// Enviar mensaje de texto
app.post('/send-message', async (req, res) => {
  const { number, message } = req.body;

  try {
    const response = await clientInstance.sendText(`${number}@c.us`, message);
    console.log('Mensaje enviado correctamente:', response);
    res.send({ status: 'Mensaje enviado', response });
  } catch (error) {
    console.error('Error al enviar mensaje:', error);
    res.status(500).send({ status: 'Error', error: error.message });
  }
});

// Enviar imagen
app.post('/send-image', upload.single('image'), async (req, res) => {
  const { number, caption } = req.body;

  if (!req.file) {
    return res.status(400).send({ status: 'Error', error: 'No se recibió la imagen en la solicitud.' });
  }

  const imagePath = req.file.path;

  try {
    const response = await clientInstance.sendImage(
      `${number}@c.us`,
      imagePath,
      req.file.originalname || 'imagen.jpg',
      caption || 'Aquí tienes tu imagen.'
    );

    console.log('Imagen enviada correctamente:', response);
    res.send({ status: 'Imagen enviada', response });
  } catch (error) {
    console.error('Error al enviar imagen:', error);
    res.status(500).send({ status: 'Error', error: error.message });
  } finally {
    fs.unlinkSync(imagePath); // Eliminar el archivo temporal
  }
});

// Iniciar el servidor con el puerto de Render
const port = process.env.PORT || 5001;
server.listen(port, () => {
  console.log(`Servidor escuchando en https://whatsappapis.onrender.com/:${port}`);
});