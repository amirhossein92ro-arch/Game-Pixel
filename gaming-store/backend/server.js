const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

if(process.env.NODE_ENV==='production')throw Error('Archived development service: deploy the root server.js application.');
app.disable('x-powered-by');
const guard=require('../../lib/request-security.cjs');const limit=guard.limiter({limit:120});
const origins=new Set((process.env.ALLOWED_ORIGINS||'http://localhost:5173,http://127.0.0.1:5173').split(',').map(v=>v.trim()).filter(Boolean));
for(const origin of origins){let url;try{url=new URL(origin);}catch{throw Error('Invalid allowed origin.');}if(!['http:','https:'].includes(url.protocol)||url.origin!==origin)throw Error('Configure exact HTTP(S) origins.');}
app.use(cors({origin(origin,cb){cb(origin&&!origins.has(origin)?Object.assign(Error('Untrusted origin.'),{status:403}):null,!!origin&&origins.has(origin));}}));
app.use(express.json({limit:'32kb'}));
app.use((req,res,next)=>{try{limit(req.ip);guard.query(req.query);res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'Permissions-Policy':'camera=(), microphone=(), geolocation=()'});next();}catch(e){if(e.retryAfter)res.set('Retry-After',String(e.retryAfter));next(e);}});

const products = require('./data/products.json');
const categories = require('./data/categories.json');

app.get('/api/products', (req, res) => {
  const { category, search, featured } = req.query;
  let results = [...products];

  if (category) {
    results = results.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }

  if (search) {
    const q = search.toLowerCase();
    results = results.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  if (featured === 'true') {
    results = results.filter(p => p.featured);
  }

  res.json(results);
});

app.get('/api/products/:id', (req, res) => {
  if(!/^[1-9]\d{0,9}$/.test(req.params.id))return res.status(400).json({error:'Invalid product id.'});
  const product = products.find(p => p.id === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

app.get('/api/categories', (req, res) => {
  res.json(categories);
});

app.use((_req,res)=>res.status(404).json({error:'Not found.'}));
app.use((e,_req,res,_next)=>res.status(e.status||500).json({error:e.type==='entity.parse.failed'?'Invalid JSON body.':e.type==='entity.too.large'?'Request body is too large.':e.status<500?e.message:'Server error.'}));
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
