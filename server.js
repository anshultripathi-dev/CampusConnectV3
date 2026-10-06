try { require('dotenv').config(); } catch {}
const http = require('http');
const express=require('express');
const cors=require('cors');
const path=require('path');
const { Server: SocketServer } = require('socket.io');
const v2Routes=require('./src/v2/routes');
const authRoutes=require('./src/v2/auth-routes');
const {dbPath}=require('./src/v2/infrastructure/database');
const realtime=require('./src/v2/infrastructure/realtime');
const {seedDemoData}=require('./src/v2/seedDemoData');
try { seedDemoData(); } catch (e) { console.warn('Demo data seeding skipped:', e.message); }

const app=express();
const PORT=process.env.PORT||3000;
const allowedOrigins=(process.env.CORS_ORIGINS||'http://localhost:5173,http://localhost:3000').split(',').map(o=>o.trim()).filter(Boolean);
app.disable('x-powered-by');
app.set('trust proxy',process.env.TRUST_PROXY==='1');
app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Cross-Origin-Opener-Policy':'same-origin-allow-popups'});next();});
app.use(cors({origin:(origin,cb)=>cb(null,!origin||allowedOrigins.includes(origin))}));
app.use(express.json({limit:'4mb'}));
app.use('/api/v2/auth',authRoutes);
app.use('/api/v2',v2Routes);
app.get('/api/health',(req,res)=>res.json({status:'ok',app:'CampusConnect',version:'3.0.0',architecture:'modular-monolith',database:dbPath,realTime:'socket.io'}));
const fs=require('fs');
const webDist=path.join(__dirname,'frontend','dist');
const webEntry=path.join(webDist,'index.html');
if (fs.existsSync(webEntry)) app.use(express.static(webDist));
app.get('*',(req,res)=>{if(req.path.startsWith('/api/'))return res.status(404).json({error:'Not found'});if(!fs.existsSync(webEntry))return res.status(503).send('Frontend not built. Run: npm run build');res.sendFile(webEntry);});

const httpServer=http.createServer(app);
const io=new SocketServer(httpServer,{cors:{origin:allowedOrigins,credentials:true}});
realtime.init(io);
httpServer.listen(PORT,()=>{
  console.log(`CampusConnect V3 running at http://localhost:${PORT}`);
  console.log(`Persistent database: ${dbPath}`);
  console.log('Real-time events: Socket.IO enabled');
  console.log(process.env.ANTHROPIC_API_KEY?'AI features: Claude + fallback':'AI features: heuristic fallback (set ANTHROPIC_API_KEY to enable Claude)');
});
