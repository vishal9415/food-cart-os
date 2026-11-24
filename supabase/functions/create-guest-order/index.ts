import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
async function sha256(value:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");}
Deno.serve(async(req:Request)=>{
 let stage="request";
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return Response.json({error:"Method not allowed"},{status:405,headers:cors});
 try{
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return Response.json({error:"Checkout service is not configured"},{status:503,headers:cors});
  stage="parse_body"; const body=await req.json(),customer=body?.customer&&typeof body.customer==="object"?body.customer:{},items=body?.items,notes=typeof body?.notes==="string"?body.notes.slice(0,500):null,token=typeof body?.session_token==="string"?body.session_token:"",requestId=typeof body?.request_id==="string"?body.request_id:"",cartId=typeof body?.cart_id==="string"?body.cart_id:"";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cartId))return Response.json({error:"This cart link is invalid. Scan the QR code again."},{status:400,headers:cors});
  if(!/^[A-Za-z0-9_-]{40,200}$/.test(token))return Response.json({error:"Customer session is invalid. Refresh the page and try again."},{status:400,headers:cors});
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId))return Response.json({error:"Checkout request is invalid. Please try again."},{status:400,headers:cors});
  if(!Array.isArray(items)||items.length<1||items.length>30)return Response.json({error:"Add between 1 and 30 items"},{status:400,headers:cors});
  const clean=items.map((item:any)=>({menu_item_id:String(item?.menu_item_id??""),quantity:Number(item?.quantity)}));
  if(clean.some((item:any)=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.menu_item_id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>999))return Response.json({error:"One or more order items are invalid"},{status:400,headers:cors});
  stage="create_session"; const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}),hash=await sha256(token);
  const {data:session,error:sessionError}=await db.from("customer_sessions").upsert({token_hash:hash,cart_id:cartId,expires_at:new Date(Date.now()+30*24*60*60*1000).toISOString()},{onConflict:"token_hash,cart_id"}).select("id").single();
  if(sessionError||!session)return Response.json({error:"Could not create your order session"},{status:500,headers:cors});
  stage="reserve_checkout"; const {data:reservation,error:reserveError}=await db.from("guest_order_requests").insert({customer_session_id:session.id,request_id:requestId}).select("id").single();
  if(reserveError){
   if(reserveError.code==="23505"){
    const {data:existing}=await db.from("guest_order_requests").select("order_id").eq("customer_session_id",session.id).eq("request_id",requestId).maybeSingle();
    if(existing?.order_id){const {data:prior}=await db.from("orders").select("id,order_number,pickup_token,subtotal,tax_amount,total_amount,status").eq("id",existing.order_id).maybeSingle();if(prior)return Response.json({order:prior,customer_session_id:session.id,replayed:true},{status:200,headers:cors});}
    return Response.json({error:"Your order is still being processed. Please check Recent orders in a moment."},{status:409,headers:cors});
   }
   return Response.json({error:"Could not start checkout. Please try again."},{status:500,headers:cors});
  }
  stage="checkout_rate_limit"; const {count:recentRequests,error:rateError}=await db.from("guest_order_requests").select("id",{count:"exact",head:true}).eq("customer_session_id",session.id).gte("created_at",new Date(Date.now()-60_000).toISOString());
  if(rateError){await db.from("guest_order_requests").delete().eq("id",reservation.id);return Response.json({error:"Checkout is temporarily unavailable. Please try again."},{status:503,headers:cors});}
  if((recentRequests||0)>5){await db.from("guest_order_requests").delete().eq("id",reservation.id);return Response.json({error:"Too many checkout attempts. Wait a minute and try again."},{status:429,headers:cors});}
  stage="create_order_rpc"; const {data:order,error}=await db.rpc("create_guest_order",{p_cart_id:cartId,p_customer:{name:typeof customer.name==="string"?customer.name.slice(0,120):"",phone:typeof customer.phone==="string"?customer.phone.slice(0,30):"",email:typeof customer.email==="string"?customer.email.slice(0,254):""},p_items:clean,p_notes:notes});
  if(error){await db.from("guest_order_requests").delete().eq("id",reservation.id);return Response.json({error:error.message},{status:400,headers:cors});}
  stage="save_checkout_receipt"; const {error:saveError}=await db.from("guest_order_requests").update({order_id:order.id}).eq("id",reservation.id);
  if(saveError)return Response.json({order,warning:"Order created. Keep pickup token "+order.pickup_token+" while we finish saving your receipt."},{status:202,headers:cors});
  stage="link_order_session"; const {error:linkError}=await db.from("orders").update({customer_session_id:session.id}).eq("id",order.id);
  if(linkError)return Response.json({order,warning:"Order created. Keep your pickup token: "+order.pickup_token},{status:202,headers:cors});
  return Response.json({order,customer_session_id:session.id},{status:201,headers:cors});
 }catch(err){console.error("create-guest-order failure",{stage,error:err instanceof Error?err.message:String(err)});return Response.json({error:"Checkout failed during "+stage+". Please try again.",stage},{status:500,headers:cors});}
});