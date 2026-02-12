require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to get the Mapbox token with origin validation
app.get('/mapbox-token', (req, res) => {
  const allowedOrigins = [
    'https://www.bungendorerfs.org',
    'http://localhost:3000',
    'https://lively-flower-0577f4700-livedev.eastasia.5.azurestaticapps.net'
  ];
  
  let origin = req.headers.origin;
  
  // If no origin header, try to extract from referer
  if (!origin && req.headers.referer) {
    try {
      origin = new URL(req.headers.referer).origin;
    } catch (e) {
      // Invalid referer URL, ignore
    }
  }
  
  // Allow requests without origin (same-origin requests)
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  res.json({ token: process.env.MAPBOX_ACCESS_TOKEN });
});

// Proxy endpoint for contact form submission
app.post('/api/contact', async (req, res) => {
  try {
    const webhookUrl = process.env.AZURE_CONTACT_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error('AZURE_CONTACT_WEBHOOK_URL not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    
    if (!response.ok) {
      console.error(`Azure webhook returned status ${response.status}`);
      return res.status(response.status).json({ error: 'Failed to submit form' });
    }
    
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      res.json(data);
    } else {
      const text = await response.text();
      res.send(text);
    }
  } catch (error) {
    console.error('Error submitting contact form:', error);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// Proxy endpoint for calendar events
app.get('/api/calendar-events', async (req, res) => {
  try {
    const webhookUrl = process.env.AZURE_CALENDAR_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error('AZURE_CALENDAR_WEBHOOK_URL not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const response = await fetch(webhookUrl);
    
    if (!response.ok) {
      console.error(`Azure webhook returned status ${response.status}`);
      return res.status(response.status).json({ error: 'Failed to fetch events' });
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Proxy endpoint for fire incidents (map data)
app.get('/api/fire-incidents', async (req, res) => {
  try {
    const webhookUrl = process.env.AZURE_INCIDENTS_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error('AZURE_INCIDENTS_WEBHOOK_URL not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const response = await fetch(webhookUrl, {
      method: 'GET',
      headers: {
        'X-Request-ID': 'Get-Fire-Incidents',
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`Azure webhook returned status ${response.status}`);
      return res.status(response.status).json({ error: 'Failed to fetch incidents' });
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching fire incidents:', error);
    res.status(500).json({ error: 'Failed to fetch incidents' });
  }
});

// Proxy endpoint for fire danger rating
app.get('/api/fire-danger', async (req, res) => {
  try {
    const webhookUrl = process.env.AZURE_FIRE_DANGER_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.error('AZURE_FIRE_DANGER_WEBHOOK_URL not configured');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const response = await fetch(webhookUrl);
    
    if (!response.ok) {
      console.error(`Azure webhook returned status ${response.status}`);
      return res.status(response.status).json({ error: 'Failed to fetch fire danger' });
    }
    
    const data = await response.text();
    res.set('Content-Type', 'application/xml');
    res.send(data);
  } catch (error) {
    console.error('Error fetching fire danger:', error);
    res.status(500).json({ error: 'Failed to fetch fire danger' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});