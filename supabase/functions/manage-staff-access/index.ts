const allowedOrigins=new Set(["https://food-cart-os.vercel.app","https://food-cart-os-vishal9415.vercel.app","https://food-cart-os-git-main-vishal9415.vercel.app","https://localhost","capacitor://localhost","http://localhost:5173","http://127.0.0.1:5173"]);
function corsHeaders(req:Request){const origin=req.headers.get("Origin")||"";const headers:Record<string,string>={"Vary":"Origin","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};if(allowedOrigins.has(origin))headers["Access-Control-Allow-Origin"]=origin;return headers;}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(req)});
 return Response.json({error:"This legacy staff endpoint is retired. Use cart owner access management."},{status:410,headers:corsHeaders(req)});
});
