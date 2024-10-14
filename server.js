const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const multer = require('multer');
const FormData = require('form-data');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Rate limiter: max 100 requests per 15 minutes
const rateLimiter = new RateLimiterMemory({
  points: 100,
  duration: 15 * 60,
});

const rateLimiterMiddleware = (req, res, next) => {
  rateLimiter.consume(req.ip)
    .then(() => {
      next();
    })
    .catch(() => {
      res.status(429).send('Too Many Requests');
    });
};

// Multer configuration for image uploads
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    console.log('Received image file:', file);
    if (file.fieldname === 'images' && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type or field name for image. Received: ${file.fieldname}, ${file.mimetype}`));
    }
  }
});

// Multer configuration for audio uploads
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB
  },
  fileFilter: (req, file, cb) => {
    console.log('Received audio file:', file);
    if (file.fieldname === 'file' && (
      file.mimetype === 'audio/mpeg' ||
      file.mimetype === 'audio/mp4' ||
      file.mimetype === 'audio/wav' ||
      file.mimetype === 'audio/webm' ||
      file.mimetype === 'audio/m4a'
    )) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type or field name for audio. Received: ${file.fieldname}, ${file.mimetype}`));
    }
  }
});

// OpenAI API endpoint for chat completions
app.post('/api/openai/chat', rateLimiterMiddleware, async (req, res) => {
  try {
    console.log('Received chat request');
    const response = await axios.post('https://api.uniapi.me/v1/chat/completions', req.body, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Chat response received');
    res.json(response.data);
  } catch (error) {
    console.error('Error calling OpenAI API:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
});

// OpenAI API endpoint for audio transcription
app.post('/api/openai/transcribe', rateLimiterMiddleware, audioUpload.single('file'), async (req, res) => {
  try {
    console.log('Received transcription request');
    console.log('File details:', req.file);

    const formData = new FormData();
    formData.append('file', req.file.buffer, { filename: req.file.originalname });
    formData.append('model', 'whisper-1');

    console.log('Sending request to OpenAI API');
    console.log('Request headers:', {
      'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY.substring(0, 5) + '...',
      ...formData.getHeaders()
    });

    const response = await axios.post('https://api.uniapi.me/v1/audio/transcriptions', formData, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      }
    });
    console.log('Transcription response received');
    res.json(response.data);
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      console.error('No response received');
    } else {
      console.error('Error setting up request:', error.message);
    }
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
});

app.post('/api/openai/process-notes', rateLimiterMiddleware, imageUpload.array('images'), async (req, res) => {
  try {
    console.log('Received request to process notes');
    console.log('Request body:', req.body);
    console.log('Received files:', req.files);

    const messages = [
      { role: "system", content: "You are a helpful assistant that analyzes notes including text and images." },
      { role: "user", content: [
        { type: "text", text: req.body.text || "Please analyze the following images and provide a summary." }
      ]}
    ];

    // Add images
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        const base64Image = file.buffer.toString('base64');
        messages[1].content.push({
          type: "image_url",
          image_url: {
            url: `data:${file.mimetype};base64,${base64Image}`
          }
        });
      });
    }

    const requestBody = {
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 300
    };

    console.log('Sending request to OpenAI API');
    const response = await axios.post('https://api.uniapi.me/v1/chat/completions', requestBody, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Received response from OpenAI API');
    res.json(response.data);
  } catch (error) {
    console.error('Error in process-notes:', error);
    console.error('Error details:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log('OpenAI API Key:', process.env.OPENAI_API_KEY.substring(0, 5) + '...');
});