import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

type MenuItem = { id:string; name:string; description:string|null; price:number; is_available:boolean; category_id:string|null; category?:{name:string}|null };
type Order = { id:string; order_number:number; customer_name:string|null; customer_phone:string|null; status:string; payment_status:string; total_amount:number; pickup_token:string|null; created_at:string; order_items:{item_name:string;quantity:number;line_total:number}[] };
const money = (n:number) => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n);
const statusNext:Record<string,string> = {placed:"accepted",accepted:"preparing",preparing:"ready",ready:"completed"};
export default function App(){
 const [mode,setMode]=useState<"customer"|"operator">("customer");
 const [menu,setMenu]=useState<MenuItem[]>([]);
 const [cart,setCart]=useState<Record<string,number>>({});
 const [orders,setOrders]=useState<Order[]>([]);
 const [user,setUser]=useState<any>(null);
 const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
 const [customer,setCustomer]=useState(""); const [phone,setPhone]=useState("");
 const [busy,setBusy]=useState(false); const [notice,setNotice]=useState("");
 const [tab,setTab]=useState("Orders"); const [search,setSearch]=useState("");
 const [storeName,setStoreName]=useState("The Food Cart");
 const [storeOpen,setStoreOpen]=useState(true);
 const total=useMemo(()=>menu.reduce((s,i)=>s+i.price*(cart[i.id]||0),0),[menu,cart]);
 const count=Object.values(cart).reduce((a,b)=>a+b,0);
 async function loadMenu(){
  if(!supabase)return;
  const [{data,error},{data:settings}]=await Promise.all([
   supabase.from("menu_items").select("id,name,description,price,is_available,category_id,menu_categories(name)").order("display_order"),
   supabase.from("store_settings").select("store_name,is_accepting_orders").limit(1).maybeSingle()
  ]);
  if(error){setNotice(error.message);return;}
  setMenu((data||[]) as any);
  if(settings){setStoreName(settings.store_name);setStoreOpen(settings.is_accepting_orders);}
 }
 async function loadOrders(){
  if(!supabase||!user)return;
  const {data,error}=await supabase.from("orders").select("id,order_number,customer_name,customer_phone,status,payment_status,total_amount,pickup_token,created_at,order_items(item_name,quantity,line_total)").order("created_at",{ascending:false}).limit(100);
  if(error){setNotice("Orders could not be loaded: "+error.message);return;}
  setOrders((data||[]) as any);
 }
 useEffect(()=>{void loadMenu(); if(!supabase)return; supabase.auth.getSession().then(({data})=>setUser(data.session?.user||null)); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,session)=>setUser(session?.user||null)); return()=>subscription.unsubscribe();},[]);
 useEffect(()=>{if(user)void loadOrders();else setOrders([]);},[user]);
 useEffect(()=>{if(!user||!supabase)return; const channel=supabase.channel("operator-orders").on("postgres_changes",{event:"*",schema:"public",table:"orders"},()=>void loadOrders()).subscribe(); const timer=window.setInterval(()=>void loadOrders(),20000); return()=>{window.clearInterval(timer);void supabase.removeChannel(channel);};},[user]);
 async function login(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);const {data,error}=await supabase.auth.signInWithPassword({email,password});setBusy(false);if(error){setNotice(error.message);return;}if(!data.user?.app_metadata?.role||!["operator","admin"].includes(data.user.app_metadata.role)){await supabase.auth.signOut();setNotice("This account is not authorised as a Food Cart operator.");return;}setUser(data.user);setNotice("Signed in.");}
 async function logout(){await supabase?.auth.signOut();setUser(null);setMode("customer");}
 async function checkout(){if(!supabase||!count||!storeOpen)return;setBusy(true);const items=menu.filter(i=>cart[i.id]>0).map(i=>({menu_item_id:i.id,quantity:cart[i.id]}));const {data,error}=await supabase.functions.invoke("create-guest-order",{body:{customer:{name:customer.trim(),phone:phone.trim()},items}});setBusy(false);if(error||!data?.order){setNotice(error?.message||data?.error||"Order could not be placed.");return;}setNotice("Order placed! Order #"+data.order.order_number+" · Pickup token "+data.order.pickup_token);setCart({});setCustomer("");setPhone("");}
 async function changeStatus(o:Order){if(!supabase)return;const next=statusNext[o.status];if(!next)return;const {error}=await supabase.from("orders").update({status:next}).eq("id",o.id);if(error)setNotice(error.message);else void loadOrders();}
 async function toggleAvailability(i:MenuItem){if(!supabase)return;const {error}=await supabase.from("menu_items").update({is_available:!i.is_available}).eq("id",i.id);if(error)setNotice(error.message);else void loadMenu();}
 const visible=menu.filter(i=>i.is_available&&i.name.toLowerCase().includes(search.toLowerCase()));
 if(!supabase)return <main className="center"><h1>Food Cart OS</h1><p>Supabase configuration is missing. Add the project URL and publishable key to .env.local.</p></main>;
 return <div className="shell"><header><div className="brand">🍃 <b>{storeName}<span> OS</span></b></div><nav><button className={mode==="customer"?"active":""} onClick={()=>setMode("customer")}>Order food</button><button className={mode==="operator"?"active":""} onClick={()=>setMode("operator")}>Operator</button></nav><small className="cloud">● Cloud connected</small></header>
 {mode==="customer"?<main className="customer"><section className="hero"><div><small>FRESHLY MADE · READY FOR PICKUP</small><h1>Good food. No queue.</h1><p>Explore the menu and order directly from {storeName}.</p></div><strong>🥙</strong></section><div className="customer-columns"><section><div className="section-head"><div><h2>Our menu</h2><p>{storeOpen?"Accepting orders":"Currently not accepting orders"}</p></div><input placeholder="Search menu" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="menu-grid">{visible.map(i=><article className="food" key={i.id}><div className="food-emoji">🍽️</div><div className="food-details"><small>{i.category?.name||"Menu"}</small><h3>{i.name}</h3><p>{i.description}</p><div className="food-foot"><b>{money(Number(i.price))}</b><div className="qty"><button onClick={()=>setCart(c=>({...c,[i.id]:Math.max(0,(c[i.id]||0)-1)}))}>−</button><span>{cart[i.id]||0}</span><button onClick={()=>setCart(c=>({...c,[i.id]:(c[i.id]||0)+1}))}>+</button></div></div></div></article>)}</div>{!visible.length&&<p className="empty">No available items match your search.</p>}</section><aside className="cart"><h2>Your order <span>{count} items</span></h2>{!count?<p className="empty">Your cart is empty. Add something delicious.</p>:<><div className="cart-lines">{menu.filter(i=>cart[i.id]>0).map(i=><div key={i.id}><span>{cart[i.id]} × {i.name}</span><b>{money(i.price*cart[i.id])}</b></div>)}</div><div className="grand"><span>Subtotal</span><b>{money(total)}</b></div><label>Your name (optional)<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Name"/></label><label>Phone (optional)<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Phone number"/></label><button className="primary wide" disabled={busy||!storeOpen} onClick={checkout}>{busy?"Placing order…":"Place pickup order · "+money(total)}</button><small className="muted">Payment is not collected in this build. Pay at the counter.</small></>}</aside></div></main>:<main className="operator"><div className="op-head"><div><small>THE FOOD CART · WORKSPACE</small><h1>Operator dashboard</h1><p>Manage incoming orders and menu availability.</p></div>{user&&<button className="outline" onClick={logout}>Sign out</button>}</div>{!user?<form className="login" onSubmit={login}><h2>Staff sign in</h2><p>Use an authorised operator account.</p><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary wide" disabled={busy}>{busy?"Signing in…":"Sign in"}</button></form>:<><div className="tabs"><button className={tab==="Orders"?"selected":""} onClick={()=>setTab("Orders")}>Orders ({orders.filter(o=>!["completed","cancelled"].includes(o.status)).length})</button><button className={tab==="Menu"?"selected":""} onClick={()=>setTab("Menu")}>Menu ({menu.length})</button></div>{tab==="Orders"?<section className="panel"><div className="section-head"><div><h2>Order queue</h2><p>Automatically refreshes when orders change.</p></div><button className="outline" onClick={()=>void loadOrders()}>Refresh</button></div>{orders.length?orders.map(o=><article className="order" key={o.id}><div><b>#{o.order_number} · {o.customer_name||"Guest"}</b><small>{new Date(o.created_at).toLocaleString("en-IN")} · Token {o.pickup_token||"—"}</small><p>{o.order_items?.map(x=>x.quantity+" × "+x.item_name).join(", ")}</p></div><div className="order-action"><b>{money(Number(o.total_amount))}</b><span className={"status "+o.status}>{o.status}</span>{statusNext[o.status]&&<button className="primary" onClick={()=>void changeStatus(o)}>Mark {statusNext[o.status]}</button>}</div></article>):<p className="empty">No orders yet. New customer orders will appear here.</p>}</section>:<section className="panel"><div className="section-head"><div><h2>Menu items</h2><p>Changes are saved directly to the cloud menu.</p></div><button className="outline" onClick={()=>void loadMenu()}>Refresh</button></div>{menu.map(i=><div className="menu-admin" key={i.id}><div><b>{i.name}</b><small>{i.category?.name||"Menu"} · {money(Number(i.price))}</small></div><button className={i.is_available?"availability on":"availability"} onClick={()=>void toggleAvailability(i)}>{i.is_available?"Available":"Unavailable"}</button></div>)}</section>}</>}</main>}
 {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}</div>;
}
