import { createClient } from "npm:@supabase/supabase-js@2";
const allowedOrigins=new Set([
 "https://food-cart-os.vercel.app",
 "https://food-cart-os-vishal9415.vercel.app",
 "https://food-cart-os-git-main-vishal9415.vercel.app",
 "https://localhost","capacitor://localhost","http://localhost:5173","http://127.0.0.1:5173"
]);
function corsHeaders(req:Request){
 const origin=req.headers.get("Origin")||"";
 const headers:Record<string,string>={"Vary":"Origin","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
 if(allowedOrigins.has(origin))headers["Access-Control-Allow-Origin"]=origin;
 return headers;
}
const reply=(req:Request,body:unknown,status=200)=>Response.json(body,{status,headers:corsHeaders(req)});
async function sha256(value:string){
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(req)});
 if(req.method!=="POST")return reply(req,{error:"Method not allowed"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return reply(req,{error:"Checkout service is not configured"},503);
  const body=await req.json();
  const customer=body?.customer&&typeof body.customer==="object"?body.customer:{};
  const rawItems=body?.items,notes=typeof body?.notes==="string"?body.notes.slice(0,500):null;
  const token=typeof body?.session_token==="string"?body.session_token:"";
  const requestId=typeof body?.request_id==="string"?body.request_id:"";
  const cartId=typeof body?.cart_id==="string"?body.cart_id:"";
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(!uuid.test(cartId))return reply(req,{error:"This cart link is invalid. Scan the QR code again."},400);
  if(!/^[a-f0-9]{64}$/i.test(token))return reply(req,{error:"Customer session is invalid. Refresh the page and try again."},400);
  if(!uuid.test(requestId))return reply(req,{error:"Checkout request is invalid. Please try again."},400);
  if(!Array.isArray(rawItems)||rawItems.length<1||rawItems.length>30)return reply(req,{error:"Add between 1 and 30 items"},400);
  const items=rawItems.map((item:any)=>({menu_item_id:String(item?.menu_item_id??""),quantity:Number(item?.quantity)}));
  if(items.some((item:any)=>!uuid.test(item.menu_item_id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>999))return reply(req,{error:"One or more order items are invalid"},400);
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  const tokenHash=await sha256(token);
  const {data:session,error:sessionError}=await db.from("customer_sessions").upsert({
   token_hash:tokenHash,cart_id:cartId,expires_at:new Date(Date.now()+30*24*60*60*1000).toISOString()
  },{onConflict:"token_hash,cart_id"}).select("id").single();
  if(sessionError||!session)return reply(req,{error:"Could not create your order session. Please refresh and try again."},503);
  const {data,error}=await db.rpc("create_guest_order_idempotent",{
   p_cart_id:cartId,p_customer:{
    name:typeof customer.name==="string"?customer.name.trim().slice(0,120):"",
    phone:typeof customer.phone==="string"?customer.phone.trim().slice(0,30):"",
    email:typeof customer.email==="string"?customer.email.trim().slice(0,254):""
   },p_items:items,p_notes:notes,p_session_id:session.id,p_request_id:requestId
  });
  if(error){
   const message=error.message||"";
   if(message.includes("RATE_LIMIT_SESSION"))return reply(req,{error:"Too many checkout attempts. Wait a minute and try again."},429);
   if(message.includes("RATE_LIMIT_CART"))return reply(req,{error:"This cart is receiving many orders right now. Please wait a moment and try again."},429);
   if(message.includes("CUSTOMER_SESSION_INVALID"))return reply(req,{error:"Customer session expired. Refresh the page and try again."},401);
   return reply(req,{error:message.includes("not accepting orders")||message.includes("unavailable")?message:"We could not place your order. Please review your cart and try again."},400);
  }
  return reply(req,{...data,customer_session_id:session.id},data?.replayed?200:201);
 }catch(error){
  console.error("create-guest-order failure",error instanceof Error?error.message:String(error));
  return reply(req,{error:"Checkout is temporarily unavailable. Your cart is safe; please try again."},500);
 }
});