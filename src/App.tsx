import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import QRCode from "qrcode";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { calculateCartTotal, getUnavailableCartItems, restoreCart, serializeCart, setCartItemQuantity } from "./cartRules";
import { getOrCreateStoredValue } from "./storageRules";
import { buildOrderCursorFilter, mergeOrderHistory } from "./orderRules";
import { restoreReceipt, serializeReceipt } from "./receiptRules";

type MenuItem = { id:string; name:string; description:string|null; price:number; is_available:boolean; category_id:string|null; category?:{name:string}|null };
type MenuCategory = {id:string;name:string};
type Order = { id:string; customer_session_id?:string|null; order_number:number; customer_name:string|null; customer_phone:string|null; status:string; payment_status:string; total_amount:number; pickup_token:string|null; created_at:string; order_items:{id:string;item_name:string;quantity:number;line_total:number;status:string}[] };
function customerCartKey(){const parts=window.location.pathname.split("/");return parts[1]==="c"&&parts[2]?parts[2]:"the-food-cart";}
function customerBasketKey(){return "food-cart-basket:"+customerCartKey();}
function restoreCustomerBasket(){try{return restoreCart(localStorage.getItem(customerBasketKey()));}catch{return {};}}
function restoreLastOrder(){const key="food-cart-last-order:"+customerCartKey();try{const raw=localStorage.getItem(key);const receipt=restoreReceipt(raw);if(!receipt&&raw)localStorage.removeItem(key);return receipt;}catch{return null;}}
const volatileSessionTokens=new Map<string,string>();
const volatileCheckoutRequestIds=new Map<string,string>();
function getCustomerSessionToken(){const key="food-cart-session-token:"+customerCartKey();return getOrCreateStoredValue(key,()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,"0")).join(""),volatileSessionTokens,()=>window.localStorage);}
function getPendingCheckoutRequestId(){const key="food-cart-pending-checkout:"+customerCartKey();return getOrCreateStoredValue(key,()=>crypto.randomUUID(),volatileCheckoutRequestIds,()=>window.localStorage);}
function elapsedLabel(value:string){const mins=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/60000));if(mins<1)return "Just now";if(mins<60)return mins+" min ago";const hours=Math.floor(mins/60);return hours+" hr "+(mins%60)+" min ago";}
const money = (n:number) => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(n);
const authRedirectUrl = () => Capacitor.isNativePlatform() ? "foodcartos://auth/callback" : window.location.origin + "/owner";
const statusNext:Record<string,string> = {placed:"accepted",accepted:"preparing",preparing:"ready",ready:"completed"};
export default function App(){
 const [mode,setMode]=useState<"customer"|"operator">(()=>Capacitor.isNativePlatform()||window.location.pathname.startsWith("/owner")?"operator":"customer");
 const menuLoadSequence=useRef(0);
 const ordersLoadSequence=useRef(0);
 const [menu,setMenu]=useState<MenuItem[]>([]);
 const [categories,setCategories]=useState<MenuCategory[]>([]);
 const [editingItem,setEditingItem]=useState<string|null>(null);
 const [itemName,setItemName]=useState(""); const [itemDescription,setItemDescription]=useState(""); const [itemPrice,setItemPrice]=useState(""); const [itemCategory,setItemCategory]=useState(""); const [newCategory,setNewCategory]=useState("");
 const [cart,setCart]=useState<Record<string,number>>(restoreCustomerBasket);
 const [orders,setOrders]=useState<Order[]>([]);
 const [hasMoreOrders,setHasMoreOrders]=useState(false);
 const [loadingOlderOrders,setLoadingOlderOrders]=useState(false);
 const [user,setUser]=useState<any>(null);
 const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
 const [ownerName,setOwnerName]=useState(""); const [newCartName,setNewCartName]=useState(""); const [newCartSlug,setNewCartSlug]=useState(""); const [showSignup,setShowSignup]=useState(false); const [isPasswordRecovery,setIsPasswordRecovery]=useState(false); const [qrDataUrl,setQrDataUrl]=useState(""); const [showQrScreen,setShowQrScreen]=useState(false);
 const [customer,setCustomer]=useState(""); const [phone,setPhone]=useState("");
 const [busy,setBusy]=useState(false); const [notice,setNotice]=useState("");
 const [customerOrders,setCustomerOrders]=useState<any[]>([]);
 const [lastOrder,setLastOrder]=useState<any>(restoreLastOrder);
 const [tab,setTab]=useState("Orders"); const [search,setSearch]=useState(""); const [selectedCategory,setSelectedCategory]=useState("all"); const [queueFilter,setQueueFilter]=useState("active"); const [orderSearch,setOrderSearch]=useState("");
 const [storeName,setStoreName]=useState("The Food Cart");
 const [storeOpen,setStoreOpen]=useState(true);
 const [storeId,setStoreId]=useState<string|null>(null);
 const [cartId,setCartId]=useState<string|null>(null);
 const [cartInfo,setCartInfo]=useState<any>(null);
 const [cartRole,setCartRole]=useState<string|null>(null);
 const [cartSlug]=useState(()=>{const match=window.location.pathname.match(/^\/c\/([^/]+)/);return match?.[1]||(window.location.pathname.startsWith("/owner")?"":"the-food-cart");});
 const [prepMinutes,setPrepMinutes]=useState(20);
 const [settingsName,setSettingsName]=useState("The Food Cart");
 const [staff,setStaff]=useState<any[]>([]);
 const [salesPeriod,setSalesPeriod]=useState<"today"|"week"|"month">("today");
 const [salesReport,setSalesReport]=useState({order_count:0,order_value:0,popular_items:[] as {name:string;quantity:number}[]});
 const [inviteEmail,setInviteEmail]=useState("");
 const [inviteRole,setInviteRole]=useState("operator");
 const isAdmin=cartRole==="owner";
 const configuredCustomerUrl=String((import.meta as any).env.VITE_CUSTOMER_BASE_URL||(import.meta as any).env.VITE_PUBLIC_APP_URL||"").trim();
 const customerBaseUrl=configuredCustomerUrl?(configuredCustomerUrl.endsWith("/")?configuredCustomerUrl.slice(0,-1):configuredCustomerUrl):(Capacitor.isNativePlatform()?"":window.location.origin);
 const customerUrl=cartInfo?.slug&&customerBaseUrl?customerBaseUrl+"/c/"+cartInfo.slug:"";
 const total=useMemo(()=>calculateCartTotal(cart,menu),[menu,cart]);
 const count=Object.values(cart).reduce((a,b)=>a+b,0);
 const distinctCartItemCount=Object.values(cart).filter(quantity=>quantity>0).length;
 const unavailableCartItems=getUnavailableCartItems(cart,menu);
 function removeCartItem(id:string){setCart(current=>{const next={...current};delete next[id];return next;});}
 const salesToday=useMemo(()=>{const start=new Date();start.setHours(0,0,0,0);const todays=orders.filter(o=>new Date(o.created_at)>=start);const top=new Map<string,number>();todays.forEach(o=>o.order_items?.forEach(i=>top.set(i.item_name,(top.get(i.item_name)||0)+i.quantity)));return {count:todays.length,value:todays.reduce((sum,o)=>sum+Number(o.total_amount||0),0),items:[...top.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5)}},[orders]);
 async function loadMenu(targetCartId?:string){
  if(!supabase)return;
  const requestSequence=++menuLoadSequence.current;
  let activeCartId=targetCartId||cartId;
  if(!activeCartId&&!cartSlug)return;
  if(!activeCartId){const {data:found,error:cartError}=await supabase.from("carts").select("id,name,slug").eq("slug",cartSlug).eq("is_active",true).maybeSingle();if(cartError||!found){setNotice("This food cart link is unavailable.");return;}activeCartId=found.id;setCartId(found.id);setCartInfo(found);}
  const [{data,error},{data:settings,error:settingsError},{data:cats,error:categoriesError}]=await Promise.all([
   supabase.from("menu_items").select("id,name,description,price,is_available,category_id,category:menu_categories(name)").eq("cart_id",activeCartId).order("display_order"),
   supabase.from("store_settings").select("id,store_name,is_accepting_orders,estimated_prep_minutes").eq("cart_id",activeCartId).maybeSingle(),
   supabase.from("menu_categories").select("id,name").eq("cart_id",activeCartId).eq("is_active",true).order("display_order")
  ]);
  if(requestSequence!==menuLoadSequence.current)return;
  if(error||settingsError||categoriesError){setNotice(error?.message||settingsError?.message||categoriesError?.message||"Menu could not be refreshed.");return;}
  setMenu((data||[]) as any);setCategories((cats||[]) as any);
  if(settings){setStoreId(settings.id);setStoreName(settings.store_name);setSettingsName(settings.store_name);setStoreOpen(settings.is_accepting_orders);setPrepMinutes(settings.estimated_prep_minutes||20);}else{setStoreOpen(false);setNotice("This cart is not fully configured yet.");}
 }
 async function loadCustomerOrders(){
  if(!supabase)return;
  if(!cartId)return;
  const {data,error}=await supabase.functions.invoke("get-customer-orders",{body:{session_token:getCustomerSessionToken(),cart_id:cartId}});
  if(error||data?.error)return;
  setCustomerOrders(data.orders||[]);
 }
 async function loadSalesReport(){
  if(!supabase||!cartId)return;
  const now=new Date(),from=new Date(now);
  if(salesPeriod==="today")from.setHours(0,0,0,0);
  if(salesPeriod==="week"){const day=(from.getDay()+6)%7;from.setDate(from.getDate()-day);from.setHours(0,0,0,0);}
  if(salesPeriod==="month"){from.setDate(1);from.setHours(0,0,0,0);}
  const {data,error}=await supabase.rpc("get_cart_sales_summary",{p_cart_id:cartId,p_from:from.toISOString(),p_to:new Date(now.getTime()+1).toISOString()});
  if(error){setNotice("Sales report could not be loaded: "+error.message);return;}
  setSalesReport({order_count:Number(data?.order_count||0),order_value:Number(data?.order_value||0),popular_items:data?.popular_items||[]});
 }
 async function loadOrders(){
  if(!supabase||!user||!cartId)return;
  const requestSequence=++ordersLoadSequence.current;
  setLoadingOlderOrders(false);
  const {data,error}=await supabase.from("orders").select("id,customer_session_id,order_number,customer_name,customer_phone,status,payment_status,total_amount,pickup_token,created_at,order_items(id,item_name,quantity,line_total,status)").eq("cart_id",cartId).order("created_at",{ascending:false}).order("id",{ascending:false}).range(0,99);
  if(requestSequence!==ordersLoadSequence.current)return;
  if(error){setNotice("Orders could not be loaded: "+error.message);return;}
  const newest=(data||[]) as Order[];
  setOrders(current=>mergeOrderHistory(newest,current));
  setHasMoreOrders((data||[]).length===100);
 }
 async function loadOlderOrders(){
  if(!supabase||!user||!cartId||loadingOlderOrders||!hasMoreOrders)return;
  const cursor=orders[orders.length-1];
  if(!cursor)return;
  const requestSequence=++ordersLoadSequence.current;
  setLoadingOlderOrders(true);
  try{
   const cursorFilter=buildOrderCursorFilter(cursor);
   const {data,error}=await supabase.from("orders").select("id,customer_session_id,order_number,customer_name,customer_phone,status,payment_status,total_amount,pickup_token,created_at,order_items(id,item_name,quantity,line_total,status)").eq("cart_id",cartId).or(cursorFilter).order("created_at",{ascending:false}).order("id",{ascending:false}).range(0,99);
   if(requestSequence!==ordersLoadSequence.current)return;
   if(error){setNotice("Older orders could not be loaded: "+error.message);return;}
   setOrders(current=>mergeOrderHistory(current,[...current,...((data||[]) as Order[])]));
   setHasMoreOrders((data||[]).length===100);
  }finally{
   if(requestSequence===ordersLoadSequence.current)setLoadingOlderOrders(false);
  }
 }
 useEffect(()=>{if(mode!=="customer")return;try{localStorage.setItem(customerBasketKey(),serializeCart(cart));}catch{setNotice("Your basket could not be saved on this device.");}},[cart,mode]);
 useEffect(()=>{
  void loadMenu();
  const client=supabase;
  if(!client)return;
  let active=true;
  const sessionReady=client.auth.getSession().then(({data})=>{if(active)setUser(data.session?.user||null);});
  const handleAuthUrl=async(url:string)=>{
   await sessionReady;
   try{
    const callback=new URL(url);
    if(callback.protocol!=="foodcartos:"||callback.hostname!=="auth"||callback.pathname!=="/callback")return;
    const hash=new URLSearchParams(callback.hash.replace(/^#/,""));
    const isRecovery=callback.searchParams.get("type")==="recovery"||hash.get("type")==="recovery";
    const code=callback.searchParams.get("code");
    if(code){
     const {error}=await client.auth.exchangeCodeForSession(code);
     if(error&&active)setNotice("The sign-in link could not be verified. Request a new link and try again.");
     else if(isRecovery&&active)setIsPasswordRecovery(true);
     return;
    }
    const access_token=hash.get("access_token"),refresh_token=hash.get("refresh_token");
    if(access_token&&refresh_token){
     const {error}=await client.auth.setSession({access_token,refresh_token});
     if(error&&active)setNotice("The sign-in link could not be verified. Request a new link and try again.");
     else if(isRecovery&&active)setIsPasswordRecovery(true);
    }
   }catch{
    if(active)setNotice("The sign-in link could not be opened. Request a new link and try again.");
   }
  };
  const {data:{subscription}}=client.auth.onAuthStateChange((event,session)=>{setUser(session?.user||null);if(event==="PASSWORD_RECOVERY")setIsPasswordRecovery(true);});
  let urlListener:ReturnType<typeof CapacitorApp.addListener>|undefined;
  if(Capacitor.isNativePlatform()){
   urlListener=CapacitorApp.addListener("appUrlOpen",({url})=>{void handleAuthUrl(url);});
   void CapacitorApp.getLaunchUrl().then(launch=>{if(launch?.url)void handleAuthUrl(launch.url);});
  }
  return()=>{active=false;subscription.unsubscribe();if(urlListener)void urlListener.then(listener=>listener.remove());};
 },[]);
 useEffect(()=>{if(user&&cartId)void loadOrders();else setOrders([]);},[user,cartId]);
 useEffect(()=>{if(user&&cartId)void loadSalesReport();},[user,cartId,salesPeriod]);
 useEffect(()=>{if(!supabase||!user||cartId)return;supabase.from("cart_members").select("cart_id,role,carts(id,name,slug)").eq("user_id",user.id).limit(1).maybeSingle().then(({data})=>{if(data){setCartId(data.cart_id);setCartRole(data.role);setCartInfo(data.carts);}});},[user,cartId]);
 useEffect(()=>{if(!customerUrl){setQrDataUrl("");return;}QRCode.toDataURL(customerUrl,{width:640,margin:2,errorCorrectionLevel:"H"}).then(setQrDataUrl).catch(()=>setQrDataUrl(""));},[customerUrl]);
 useEffect(()=>{if(!cartId)return;void loadMenu(cartId);const menuTimer=window.setInterval(()=>void loadMenu(cartId),60000);return()=>window.clearInterval(menuTimer);},[cartId]);
 useEffect(()=>{if(mode!=="customer"||!cartId)return;void loadCustomerOrders();},[cartId,mode]);
 useEffect(()=>{if(mode!=="customer"||!cartId||(customerOrders.length===0&&!lastOrder))return;const customerTimer=window.setInterval(()=>void loadCustomerOrders(),20000);return()=>window.clearInterval(customerTimer);},[cartId,mode,customerOrders.length,lastOrder?.id]);
 useEffect(()=>{if(isAdmin)void loadStaff();else setStaff([]);},[user,cartRole,cartId]);
 useEffect(()=>{const client=supabase;if(!user||!client||!cartId||tab!=="Orders")return;const channel=client.channel("operator-orders-"+cartId).on("postgres_changes",{event:"*",schema:"public",table:"orders",filter:"cart_id=eq."+cartId},()=>void loadOrders()).subscribe();void loadOrders();const timer=window.setInterval(()=>void loadOrders(),20000);return()=>{window.clearInterval(timer);void client.removeChannel(channel);};},[user,cartId,tab]);
 async function login(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error){setBusy(false);setNotice(error.message);return;}const {data:membership}=await supabase.from("cart_members").select("cart_id,role,carts(id,name,slug)").eq("user_id",data.user.id).limit(1).maybeSingle();setBusy(false);setUser(data.user);if(membership){setCartId(membership.cart_id);setCartRole(membership.role);setCartInfo(membership.carts);setNotice("Signed in.");}else{setNotice("Signed in. Create your food cart to finish setup.");}}
 async function logout(){await supabase?.auth.signOut();setUser(null);setCartId(null);setCartInfo(null);setCartRole(null);setMode("operator");}
 async function sendPasswordReset(){if(!supabase||!email.trim()){setNotice("Enter your account email first.");return;}setBusy(true);const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:authRedirectUrl()});setBusy(false);setNotice(error?error.message:"Password reset link sent. Check your email.");}
 async function updatePassword(e:React.FormEvent){e.preventDefault();if(!supabase||password.length<8){setNotice("Use a password with at least 8 characters.");return;}setBusy(true);const {error}=await supabase.auth.updateUser({password});setBusy(false);if(error){setNotice(error.message);return;}setPassword("");setIsPasswordRecovery(false);setNotice("Password updated. You can continue using your cart.");}
 async function registerOwner(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:ownerName.trim()},emailRedirectTo:authRedirectUrl()}});setBusy(false);if(error){setNotice(error.message);return;}if(!data.session){setNotice("Check your email to confirm your account, then sign in to create your cart.");setShowSignup(false);return;}setUser(data.user);setShowSignup(false);setNotice("Account created. Now set up your cart.");}
 async function createOwnerCart(e:React.FormEvent){e.preventDefault();if(!supabase||!user)return;setBusy(true);const {data,error}=await supabase.functions.invoke("create-cart",{body:{name:newCartName.trim(),slug:newCartSlug.trim().toLowerCase()}});setBusy(false);if(error||data?.error){setNotice(data?.error||error?.message||"Could not create cart.");return;}setCartId(data.cart.id);setCartInfo(data.cart);setCartRole("owner");setNotice("Your cart is ready. Add your menu and share its QR code.");void loadMenu(data.cart.id);}

 async function manageStaff(payload:Record<string,string>){
  if(!supabase)return null;
  const {data,error}=await supabase.functions.invoke("manage-cart-members",{body:{...payload,cart_id:cartId}});
  if(error||data?.error){setNotice(data?.error||error?.message||"Staff access request failed.");return null;}
  return data;
 }
 async function loadStaff(){
  if(!isAdmin)return;
  const data=await manageStaff({action:"list"});
  if(data)setStaff(data.members||[]);
 }
 async function inviteStaff(e:React.FormEvent){
  e.preventDefault();setBusy(true);
  const data=await manageStaff({action:"invite",email:inviteEmail,role:inviteRole});
  setBusy(false);
  if(data){setNotice("Team access added for "+inviteEmail+".");setInviteEmail("");void loadStaff();}
 }
 async function changeStaffRole(id:string,role:string){
  setBusy(true);const data=await manageStaff({action:"set_role",user_id:id,role});setBusy(false);
  if(data){setNotice("Team role updated.");void loadStaff();}
 }
 async function removeStaff(id:string){setBusy(true);const data=await manageStaff({action:"remove",user_id:id});setBusy(false);if(data){setNotice("Team member removed.");void loadStaff();}}
 async function checkout(){
  if(!supabase||!count||!storeOpen||!cartId)return;
  if(unavailableCartItems.length){setNotice("Some items in your cart are no longer available. Remove them to continue.");return;}
  if(distinctCartItemCount>30){setNotice("An order can contain up to 30 different menu items. Remove "+(distinctCartItemCount-30)+" different item(s) to continue.");return;}
  setBusy(true);
  try{
   const items=menu.filter(i=>i.is_available&&cart[i.id]>0).map(i=>({menu_item_id:i.id,quantity:cart[i.id],expected_unit_price:i.price}));
   const {data,error}=await supabase.functions.invoke("create-guest-order",{body:{cart_id:cartId,customer:{name:customer.trim(),phone:phone.trim()},items,session_token:getCustomerSessionToken(),request_id:getPendingCheckoutRequestId()}});
   if(error||!data?.order){
    let message=data?.error||error?.message||"Order could not be placed.";
    const response=(error as any)?.context;
    if(response&&typeof response.clone==="function"){try{const detail=await response.clone().json();if(typeof detail?.error==="string")message=detail.error;}catch{}}
    setNotice(message);
    if(/availability changed|menu price|not accepting|unavailable/i.test(message))void loadMenu(cartId);
    return;
   }
   const receipt={...data.order,created_at:new Date().toISOString(),customer_name:customer.trim()||"Guest"};
   setLastOrder(receipt);
   try{localStorage.setItem("food-cart-last-order:"+customerCartKey(),serializeReceipt(receipt));}catch{}
   try{localStorage.removeItem("food-cart-pending-checkout:"+customerCartKey());}catch{}
   setNotice((data.replayed?"We found your previous order; no duplicate was created. ":"Order placed! ")+"Order #"+data.order.order_number+" · Pickup token "+data.order.pickup_token);
   void loadCustomerOrders();
   setCart({});
   setCustomer("");
   setPhone("");
  }catch{
   setNotice("We couldn't confirm the order because the connection was interrupted. Keep this page open and retry so we can reuse the same request ID.");
  }finally{
   setBusy(false);
  }
 }
 async function changeItemStatus(order:Order,itemId:string,next:string,current:string){
  if(!supabase)return;
  const transitions:Record<string,string[]>={pending:["preparing"],preparing:["ready"],ready:["served"],served:[]};
  if(!(transitions[current]||[]).includes(next)){setNotice("Items must move in order: Pending → Preparing → Ready → Served.");return;}
  const {data,error}=await supabase.rpc("update_order_item_status",{p_order_item_id:itemId,p_next_status:next});
  if(error){setNotice(error.message.includes("INVALID_STATUS_TRANSITION")?"This item was updated by another team member. Refresh the order and try again.":error.message);return;}
  setNotice("Item updated. Order status: "+String(data?.order_status||"updated").replace(/_/g," ")+".");
  void loadOrders();
 }
 function startEditItem(i:MenuItem){setEditingItem(i.id);setItemName(i.name);setItemDescription(i.description||"");setItemPrice(String(i.price));setItemCategory(i.category_id||"");}
 function resetItemForm(){setEditingItem(null);setItemName("");setItemDescription("");setItemPrice("");setItemCategory("");}
 async function saveMenuItem(e:React.FormEvent){
  e.preventDefault();if(!supabase)return;
  const price=Number(itemPrice);
  if(!itemName.trim()||!Number.isFinite(price)||price<=0){setNotice("Enter a valid item name and price.");return;}
  setBusy(true);
  const payload={cart_id:cartId,name:itemName.trim(),description:itemDescription.trim()||null,price,category_id:itemCategory||null};
  const result=editingItem?await supabase.from("menu_items").update(payload).eq("id",editingItem):await supabase.from("menu_items").insert(payload);
  setBusy(false);
  if(result.error){setNotice(result.error.message);return;}
  setNotice(editingItem?"Menu item updated.":"Menu item added.");resetItemForm();void loadMenu();
 }
 async function createCategory(){
  if(!supabase||!newCategory.trim())return;
  setBusy(true);const {data,error}=await supabase.from("menu_categories").insert({cart_id:cartId,name:newCategory.trim()}).select("id,name").single();setBusy(false);
  if(error){setNotice(error.message);return;}
  setCategories(c=>[...c,data]);setItemCategory(data.id);setNewCategory("");setNotice("Category created.");
 }
 async function deleteMenuItem(i:MenuItem){
  if(!supabase||!isAdmin||!cartId)return;
  if(!window.confirm("Delete \""+i.name+"\" from your menu? This cannot be undone. Existing orders will keep their saved item details."))return;
  setBusy(true);
  const {error}=await supabase.from("menu_items").delete().eq("id",i.id).eq("cart_id",cartId);
  setBusy(false);
  if(error){setNotice("Menu item could not be deleted: "+error.message);return;}
  if(editingItem===i.id)resetItemForm();
  setNotice("Menu item deleted. Existing orders are unchanged.");
  void loadMenu(cartId);
 }
 async function deleteCategory(category:MenuCategory){
  if(!supabase||!isAdmin||!cartId)return;
  const linkedItems=menu.filter(i=>i.category_id===category.id).length;
  const detail=linkedItems?" "+linkedItems+" menu item(s) will be kept and moved to Uncategorised.":"";
  if(!window.confirm("Delete category \""+category.name+"\"?"+detail+" This cannot be undone."))return;
  setBusy(true);
  const {error}=await supabase.from("menu_categories").delete().eq("id",category.id).eq("cart_id",cartId);
  setBusy(false);
  if(error){setNotice("Category could not be deleted: "+error.message);return;}
  if(itemCategory===category.id)setItemCategory("");
  if(selectedCategory===category.id)setSelectedCategory("all");
  setNotice("Category deleted. Its menu items have been kept.");
  void loadMenu(cartId);
 }
 async function saveStoreSettings(e:React.FormEvent){
  e.preventDefault();if(!supabase||!storeId)return;
  if(!settingsName.trim()||!Number.isInteger(prepMinutes)||prepMinutes<1||prepMinutes>240){setNotice("Enter a store name and preparation estimate between 1 and 240 minutes.");return;}
  setBusy(true);
  const {error}=await supabase.from("store_settings").update({store_name:settingsName.trim(),is_accepting_orders:storeOpen,estimated_prep_minutes:prepMinutes}).eq("id",storeId);
  setBusy(false);if(error){setNotice(error.message);return;}
  setNotice("Store settings saved.");void loadMenu();
 }
 async function toggleAvailability(i:MenuItem){if(!supabase)return;const {error}=await supabase.from("menu_items").update({is_available:!i.is_available}).eq("id",i.id);if(error)setNotice(error.message);else void loadMenu();}
 const customerCategories=categories.filter(c=>menu.some(i=>i.is_available&&i.category_id===c.id));
 const visible=menu.filter(i=>i.is_available&&i.name.toLowerCase().includes(search.toLowerCase())&&(selectedCategory==="all"||i.category_id===selectedCategory));
 if(!supabase)return <main className="center"><h1>Food Cart OS</h1><p>Supabase configuration is missing. Add the project URL and publishable key to .env.local.</p></main>;
 return <div className="shell"><header><div className="brand">🍃 <b>{storeName}<span> OS</span></b></div><small className="cloud">● Cloud connected</small></header>
 {mode==="customer"?<main className="customer"><section className="hero"><div><small>FRESHLY MADE · READY FOR PICKUP</small><h1>Good food. No queue.</h1><p>Explore the menu and order directly from {storeName}.</p></div><strong>🥙</strong></section><div className="customer-columns"><section><div className="section-head"><div><h2>Our menu</h2><p>{storeOpen?`Accepting orders · Estimated preparation ${prepMinutes} min`:"Currently not accepting orders"}</p></div><input placeholder="Search menu" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="category-chips"><button className={selectedCategory==="all"?"active":""} onClick={()=>setSelectedCategory("all")}>All</button>{customerCategories.map(c=><button key={c.id} className={selectedCategory===c.id?"active":""} onClick={()=>setSelectedCategory(c.id)}>{c.name}</button>)}</div><div className="menu-grid">{visible.map(i=><article className="food" key={i.id}><div className="food-emoji">🍽️</div><div className="food-details"><small>{i.category?.name||"Menu"}</small><h3>{i.name}</h3><p>{i.description}</p><div className="food-foot"><b>{money(Number(i.price))}</b><div className="qty"><button onClick={()=>setCart(c=>setCartItemQuantity(c,i.id,(c[i.id]||0)-1))}>−</button><span>{cart[i.id]||0}</span><button disabled={(cart[i.id]||0)>=999} title="Maximum 999 per item" onClick={()=>setCart(c=>setCartItemQuantity(c,i.id,(c[i.id]||0)+1))}>+</button></div></div></div></article>)}</div>{!visible.length&&<p className="empty">No available items match your search.</p>}</section><aside className="cart">{customerOrders.length>0&&<div className="last-receipt"><b>Your recent orders</b>{customerOrders.map((o:any)=><div key={o.id}><strong>#{o.order_number} · {money(Number(o.total_amount))}</strong><span>{o.status.replaceAll("_"," ")} · Token {o.pickup_token}</span>{o.order_items?.map((it:any)=><small key={it.item_name}>{it.quantity} × {it.item_name} — {it.status}</small>)}</div>)}<button className="outline" onClick={()=>void loadCustomerOrders()}>Refresh order status</button></div>}{lastOrder&&<div className="last-receipt"><b>Recent order confirmed</b><strong>Order #{lastOrder.order_number}</strong><span>Pickup token: {lastOrder.pickup_token}</span><small>Keep this token to identify your order at pickup.</small><button className="outline" onClick={()=>{setLastOrder(null);localStorage.removeItem("food-cart-last-order:"+customerCartKey());}}>Dismiss receipt</button></div>}<h2>Your order <span>{count} items</span></h2>{!count?<p className="empty">Your cart is empty. Add something delicious.</p>:<><div className="cart-lines">{Object.entries(cart).filter(([,quantity])=>quantity>0).map(([id,quantity])=>{const item=menu.find(i=>i.id===id);const unavailable=!item||!item.is_available;return <div key={id} className={unavailable?"cart-line-unavailable":""}><span>{quantity} × {item?.name||"Removed menu item"}{unavailable&&<small className="muted">No longer available</small>}</span>{unavailable?<button type="button" className="text-button" onClick={()=>removeCartItem(id)}>Remove</button>:<><b>{money(Number(item.price)*quantity)}</b><button type="button" className="text-button" onClick={()=>removeCartItem(id)}>Remove</button></>}</div>;})}</div>{unavailableCartItems.length>0&&<p className="muted" role="alert">An item was removed or marked unavailable by the cart owner. Remove it from your order to continue.</p>}{distinctCartItemCount>30&&<p className="muted" role="alert">Orders can contain up to 30 different menu items. Remove {distinctCartItemCount-30} different item(s) to continue.</p>}<div className="grand"><span>Subtotal</span><b>{money(total)}</b></div><label>Your name (optional)<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Name"/></label><label>Phone (optional)<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Phone number"/></label><button className="primary wide" disabled={busy||!storeOpen||unavailableCartItems.length>0||distinctCartItemCount>30} onClick={checkout}>{busy?"Placing order…":"Place pickup order · "+money(total)}</button><small className="muted">Payment is not collected in this build. Pay at the counter.</small></>}</aside></div></main>:<main className="operator"><div className="op-head"><div><small>THE FOOD CART · WORKSPACE</small><h1>{cartRole==="owner"?"Owner workspace":cartRole==="manager"?"Manager workspace":"Operator workspace"}</h1><p>Manage orders, menus, prices, availability and store settings.</p></div>{user&&<button className="outline" onClick={logout}>Sign out</button>}</div>{isPasswordRecovery?<form className="login" onSubmit={updatePassword}><h2>Set a new password</h2><label>New password<input type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/></label><button className="primary wide" disabled={busy}>{busy?"Updating…":"Update password"}</button></form>:user&&!cartId?<form className="login" onSubmit={createOwnerCart}><h2>Set up your food cart</h2><p>Choose the name customers will see and a unique QR link.</p><label>Cart name<input required minLength={2} maxLength={80} value={newCartName} onChange={e=>setNewCartName(e.target.value)} placeholder="e.g. My Food Cart"/></label><label>QR link name<input required minLength={3} maxLength={40} value={newCartSlug} onChange={e=>setNewCartSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))} placeholder="my-food-cart"/></label><button className="primary wide" disabled={busy}>{busy?"Creating…":"Create my cart"}</button></form>:!user?<><form className="login" onSubmit={login}><h2>Owner sign in</h2><p>Manage your menu, orders and QR code.</p><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary wide" disabled={busy}>{busy?"Signing in…":"Sign in"}</button><button type="button" className="outline wide" onClick={()=>setShowSignup(v=>!v)}>Create an owner account</button><button type="button" className="text-button" disabled={busy} onClick={()=>void sendPasswordReset()}>Forgot password?</button></form>{showSignup&&<form className="login" onSubmit={registerOwner}><h2>Create your owner account</h2><label>Your name<input required value={ownerName} onChange={e=>setOwnerName(e.target.value)}/></label><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary wide" disabled={busy}>{busy?"Creating account…":"Sign up"}</button></form>}</>:<><div className="tabs"><button className={tab==="Orders"?"selected":""} onClick={()=>setTab("Orders")}>Orders ({orders.filter(o=>!["completed","cancelled"].includes(o.status)).length})</button><button className={tab==="Menu"?"selected":""} onClick={()=>setTab("Menu")}>Menu ({menu.length})</button><button className={tab==="Sales"?"selected":""} onClick={()=>setTab("Sales")}>Sales</button><button className={tab==="Settings"?"selected":""} onClick={()=>setTab("Settings")}>Settings</button>{isAdmin&&<button className={tab==="Access"?"selected":""} onClick={()=>setTab("Access")}>Access management</button>}</div>{tab==="Orders"?<section className="panel"><div className="section-head"><div><h2>Order queue</h2><p>Automatically refreshes when orders change. Open orders are sorted newest first.</p></div><button className="outline" onClick={()=>void loadOrders()}>Refresh</button></div><div className="queue-tools"><input placeholder="Find order, token or customer" value={orderSearch} onChange={e=>setOrderSearch(e.target.value)}/><div className="queue-filters"><button className={queueFilter==="active"?"active":""} onClick={()=>setQueueFilter("active")}>Active</button><button className={queueFilter==="completed"?"active":""} onClick={()=>setQueueFilter("completed")}>Completed</button><button className={queueFilter==="all"?"active":""} onClick={()=>setQueueFilter("all")}>All</button></div></div><small className="muted">Search checks orders currently loaded. Load older orders to include earlier history.</small>{orders.filter(o=>(queueFilter==="all"|| (queueFilter==="active"?!["completed","cancelled"].includes(o.status):queueFilter==="completed"?["completed","cancelled"].includes(o.status):o.status===queueFilter))&&(!orderSearch||String(o.order_number).includes(orderSearch)||String(o.pickup_token||"").toLowerCase().includes(orderSearch.toLowerCase())||String(o.customer_name||"").toLowerCase().includes(orderSearch.toLowerCase()))).sort((a,b)=>queueFilter==="active"?String(a.created_at).localeCompare(String(b.created_at)):new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).length?orders.filter(o=>(queueFilter==="all"|| (queueFilter==="active"?!["completed","cancelled"].includes(o.status):queueFilter==="completed"?["completed","cancelled"].includes(o.status):o.status===queueFilter))&&(!orderSearch||String(o.order_number).includes(orderSearch)||String(o.pickup_token||"").toLowerCase().includes(orderSearch.toLowerCase())||String(o.customer_name||"").toLowerCase().includes(orderSearch.toLowerCase()))).sort((a,b)=>queueFilter==="active"?String(a.created_at).localeCompare(String(b.created_at)):new Date(b.created_at).getTime()-new Date(a.created_at).getTime()).map(o=><article className="order" key={o.id}><div><b>#{o.order_number} · {o.customer_name||"Guest"}</b><small>{new Date(o.created_at).toLocaleString("en-IN")} · {elapsedLabel(o.created_at)} · Token {o.pickup_token||"—"}{o.customer_session_id?" · Repeat-order session":""}</small><div className="order-items">{o.order_items?.map(x=><div className="order-item-row" key={x.id}><span>{x.quantity} × {x.item_name}</span><select aria-label={"Status for "+x.item_name} value={x.status||"pending"} onChange={e=>void changeItemStatus(o,x.id,e.target.value,x.status||"pending")}><option value="pending" disabled={x.status!=="pending"}>Pending</option><option value="preparing" disabled={x.status!=="pending"&&x.status!=="preparing"}>Preparing</option><option value="ready" disabled={x.status!=="preparing"&&x.status!=="ready"}>Ready</option><option value="served" disabled={x.status!=="ready"&&x.status!=="served"}>Served</option></select></div>)}</div></div><div className="order-action"><b>{money(Number(o.total_amount))}</b><span className={"status "+o.status}>{o.status}</span><small className="muted">Fulfil each item separately</small></div></article>):<p className="empty">No orders yet. New customer orders will appear here.</p>}{hasMoreOrders&&<div className="section-head"><span className="muted">Showing {orders.length} orders</span><button className="outline" disabled={loadingOlderOrders} onClick={()=>void loadOlderOrders()}>{loadingOlderOrders?"Loading…":"Load older orders"}</button></div>}</section>:tab==="Settings"?<><section className="panel"><div className="section-head"><div><h2>Store settings</h2><p>Control how customers see and order from your cart.</p></div></div><form className="menu-editor" onSubmit={saveStoreSettings}><label>Store name<input required value={settingsName} onChange={e=>setSettingsName(e.target.value)} placeholder="The Food Cart"/></label><label>Estimated preparation time (minutes)<input type="number" min="1" max="240" step="1" value={prepMinutes} onChange={e=>setPrepMinutes(Number(e.target.value))}/></label><div className="store-open-control"><div><b>Accepting orders</b><small>{storeOpen?"Customers can place orders":"New orders are paused"}</small></div><button type="button" className={storeOpen?"availability on":"availability"} onClick={()=>setStoreOpen(v=>!v)}>{storeOpen?"Open":"Paused"}</button></div><button className="primary" disabled={busy||!storeId}>{busy?"Saving…":"Save settings"}</button></form><div className="panel qr-panel"><div><h3>Your customer QR code</h3><p>Customers scan this code to open your menu and place cash-on-pickup orders.</p><p><b>{cartInfo?.name||storeName}</b><br/><small>{customerUrl||"Set your public web domain to activate the customer QR code."}</small></p>{qrDataUrl&&<img className="cart-qr" src={qrDataUrl} alt="Customer ordering QR code"/>}<div className="qr-actions">{qrDataUrl&&<a className="primary qr-download" href={qrDataUrl} download={(cartInfo?.slug||"food-cart")+"-qr.png"}>Download QR image</a>}<button type="button" className="outline" disabled={!qrDataUrl} onClick={()=>window.print()}>Print QR</button><button type="button" className="outline" disabled={!customerUrl} onClick={()=>void navigator.clipboard.writeText(customerUrl)}>Copy link</button><button type="button" className="outline" disabled={!qrDataUrl} onClick={()=>setShowQrScreen(true)}>Show on screen</button></div></div></div></section>{showQrScreen&&<div className="qr-screen" role="dialog" aria-modal="true" aria-label="Customer QR display"><button type="button" className="qr-screen-close" onClick={()=>setShowQrScreen(false)}>Close ×</button><h1>{cartInfo?.name||storeName}</h1><p>Scan to view menu & order</p>{qrDataUrl&&<img src={qrDataUrl} alt="Scan to order QR code"/>}<strong>Pay cash at pickup</strong></div>}</>:tab==="Sales"?<section className="panel"><div className="section-head"><div><h2>Sales overview</h2><p>Order value by reporting period. Cancelled orders are excluded.</p></div><div className="sales-periods"><button className={salesPeriod==="today"?"active":""} onClick={()=>setSalesPeriod("today")}>Today</button><button className={salesPeriod==="week"?"active":""} onClick={()=>setSalesPeriod("week")}>This week</button><button className={salesPeriod==="month"?"active":""} onClick={()=>setSalesPeriod("month")}>This month</button></div></div><div className="sales-metrics"><article><small>Orders</small><strong>{salesReport.order_count}</strong></article><article><small>Order value</small><strong>{money(salesReport.order_value)}</strong></article></div><h3 className="sales-subtitle">Popular items</h3>{salesReport.popular_items.length?salesReport.popular_items.map(item=><div className="sales-item" key={item.name}><span>{item.name}</span><b>{item.quantity} sold</b></div>):<p className="empty">No orders recorded in this period.</p>}<p className="muted left">Order value is not the same as collected revenue. Payments are currently cash at pickup and are not reconciled here.</p></section>:tab==="Menu"?<section className="panel"><div className="section-head"><div><h2>Menu items</h2><p>Add, edit, price and manage availability.</p></div><button className="outline" onClick={()=>void loadMenu()}>Refresh</button></div>
<form className="menu-editor" onSubmit={saveMenuItem}><h3>{editingItem?"Edit menu item":"Add menu item"}</h3><label>Item name<input required value={itemName} onChange={e=>setItemName(e.target.value)} placeholder="e.g. Paneer Tikka Roll"/></label><label>Description<input value={itemDescription} onChange={e=>setItemDescription(e.target.value)} placeholder="Short description"/></label><div className="menu-editor-row"><label>Price (₹)<input required type="number" min="1" step="0.01" value={itemPrice} onChange={e=>setItemPrice(e.target.value)} placeholder="120"/></label><label>Category<select value={itemCategory} onChange={e=>setItemCategory(e.target.value)}><option value="">Uncategorised</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><div className="menu-editor-actions"><button className="primary" disabled={busy}>{busy?"Saving…":editingItem?"Save changes":"Add item"}</button>{editingItem&&<button type="button" className="outline" onClick={resetItemForm}>Cancel</button>}</div></form>
<div className="category-create"><input value={newCategory} onChange={e=>setNewCategory(e.target.value)} placeholder="New category name"/><button className="outline" disabled={busy||!newCategory.trim()} onClick={()=>void createCategory()}>Add category</button></div>
{categories.length>0&&<div className="category-admin-list"><h3>Categories</h3>{categories.map(category=><div className="menu-admin" key={category.id}><div><b>{category.name}</b><small>{menu.filter(i=>i.category_id===category.id).length} menu item(s)</small></div>{isAdmin&&<button type="button" className="outline" disabled={busy} onClick={()=>void deleteCategory(category)}>Delete category</button>}</div>)}</div>}
{menu.map(i=><div className="menu-admin" key={i.id}><div><b>{i.name}</b><small>{i.category?.name||"Menu"} · {money(Number(i.price))}{!i.is_available?" · Unavailable":""}</small></div><div className="menu-admin-actions"><button className="outline" onClick={()=>startEditItem(i)}>Edit</button><button className={i.is_available?"availability on":"availability"} onClick={()=>void toggleAvailability(i)}>{i.is_available?"Available":"Unavailable"}</button>{isAdmin&&<button type="button" className="outline" disabled={busy} onClick={()=>void deleteMenuItem(i)}>Delete</button>}</div></div>)}</section>:<section className="panel"><div className="section-head"><div><h2>Staff access</h2><p>Invite team members and control their permissions.</p></div><button className="outline" onClick={()=>void loadStaff()}>Refresh</button></div><form className="invite-form" onSubmit={inviteStaff}><label>Staff email<input type="email" required value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="name@example.com"/></label><label>Access level<select value={inviteRole} onChange={e=>setInviteRole(e.target.value)}><option value="operator">Operator</option><option value="manager">Manager</option></select></label><button className="primary" disabled={busy||!inviteEmail.trim()}>{busy?"Sending…":"Invite staff"}</button></form><p className="muted left">Only owners can invite, change or remove team members. Managers and operators can manage orders, menus, prices, availability and store settings.</p><div className="staff-list"><div className="staff-row staff-head"><span>Team member</span><span>Access</span></div>{staff.map(person=><div className="staff-row" key={person.id}><div><b>{person.email||"No email"}</b><small>Joined {new Date(person.created_at).toLocaleDateString("en-IN")}{person.last_sign_in_at?" · Last active "+new Date(person.last_sign_in_at).toLocaleDateString("en-IN"):" · Not signed in yet"}</small></div><div className="staff-controls"><select disabled={busy||person.id===user.id} value={person.role} onChange={e=>void changeStaffRole(person.id,e.target.value)}><option value="owner">Owner</option><option value="operator">Operator</option><option value="manager">Manager</option></select>{person.id!==user.id&&<button type="button" className="outline" disabled={busy} onClick={()=>{if(window.confirm("Remove "+(person.email||"this team member")+" from this cart?"))void removeStaff(person.id);}}>Remove</button>}</div></div>)}</div></section>}</>}</main>}
 {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}</div>;
}
