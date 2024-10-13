const express = require('express');
const axios = require('axios');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(helmet()); // Adds various HTTP headers for security

// Rate limiter: max 100 requests per 15 minutes
const rateLimiter = new RateLimiterMemory({
  points: 100,
  duration: 15 * 60,
});

// Middleware to apply rate limiting
const rateLimiterMiddleware = (req, res, next) => {
  rateLimiter.consume(req.ip)
    .then(() => {
      next();
    })
    .catch(() => {
      res.status(429).send('Too Many Requests');
    });
};

app.use(rateLimiterMiddleware);

// OpenAI API endpoint
app.post('/api/openai', async (req, res) => {
  try {
    const response = await axios.post('https://api.uniapi.me/v1/chat/completions', req.body, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error calling OpenAI API:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});