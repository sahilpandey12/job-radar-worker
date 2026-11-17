import { handleApi } from '../lib/api.js';

export const config = { api: { bodyParser: false } };
export default async function handler(req,res) {
  try {
    const origin=`https://${req.headers.host||'job-finder.local'}`;
    const url=new URL(req.url||'/',origin);
    const headers=new Headers();for(const [key,value] of Object.entries(req.headers||{})){if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):String(value));}
    let body;
    if(!['GET','HEAD'].includes(req.method||'GET')){const parts=[];for await(const chunk of req)parts.push(Buffer.from(chunk));if(parts.length)body=Buffer.concat(parts);}
    const request=new Request(url,{method:req.method||'GET',headers,...(body?{body}:{}),...(body?{duplex:'half'}:{})});
    const response=await handleApi(request);res.statusCode=response.status;response.headers.forEach((value,key)=>res.setHeader(key,value));
    const text=await response.text();res.end(text);
  } catch(error) {res.statusCode=500;res.setHeader('content-type','application/json');res.end(JSON.stringify({error:String(error?.message||error)}));}
}
