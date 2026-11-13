import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

type MenuItem = { id:string; name:string; description:string|null; price:number; is_available:boolean; category_id:string|null; category?:{name:string}|null };
type Order = { id:string; order_number:number; customer_name:string|null; customer_phone:string|null; status:string; payment_status:string; total_amount:number; pickup_token:string|null; created_at:string; order_items:{id:string;item_name:string;quantity:number;line_total:number;status:string}[] };
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
 const [staff,setStaff]=useState<any[]>([]);
 const [inviteEmail,setInviteEmail]=useState("");
 const [inviteRole,setInviteRole]=useState("operator");
 const isAdmin=user?.app_metadata?.role==="admin";
 const total=useMemo(()=>menu.reduce((s,i)=>s+i.price*(cart[i.id]||0),0),[menu,cart]);
 const count=Object.values(cart).reduce((a,b)=>a+b,0);
 async function loadMenu(){
  if(!supabase)return;
  const [{data,error},{data:settings}]=await Promise.all([
   supabase.from("menu_items").select("id,name,description,price,is_available,category_id,category:menu_categories(name)").order("display_order"),
   supabase.from("store_settings").select("store_name,is_accepting_orders").limit(1).maybeSingle()
  ]);
  if(error){setNotice(error.message);return;}
  setMenu((data||[]) as any);
  if(settings){setStoreName(settings.store_name);setStoreOpen(settings.is_accepting_orders);}
 }
 async function loadOrders(){
  if(!supabase||!user)return;
  const {data,error}=await supabase.from("orders").select("id,order_number,customer_name,customer_phone,status,payment_status,total_amount,pickup_token,created_at,order_items(id,item_name,quantity,line_total,status)").order("created_at",{ascending:false}).limit(100);
  if(error){setNotice("Orders could not be loaded: "+error.message);return;}
  setOrders((data||[]) as any);
 }
 useEffect(()=>{void loadMenu(); if(!supabase)return; supabase.auth.getSession().then(({data})=>setUser(data.session?.user||null)); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,session)=>setUser(session?.user||null)); return()=>subscription.unsubscribe();},[]);
 useEffect(()=>{if(user)void loadOrders();else setOrders([]);},[user]);
 useEffect(()=>{if(isAdmin)void loadStaff();else setStaff([]);},[user]);
 useEffect(()=>{const client=supabase;if(!user||!client)return; const channel=client.channel("operator-orders").on("postgres_changes",{event:"*",schema:"public",table:"orders"},()=>void loadOrders()).subscribe(); const timer=window.setInterval(()=>void loadOrders(),20000); return()=>{window.clearInterval(timer);void client.removeChannel(channel);};},[user]);
 async function login(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);const {data,error}=await supabase.auth.signInWithPassword({email,password});setBusy(false);if(error){setNotice(error.message);return;}if(!data.user?.app_metadata?.role||!["operator","admin"].includes(data.user.app_metadata.role)){await supabase.auth.signOut();setNotice("This account is not authorised as a Food Cart operator.");return;}setUser(data.user);setNotice("Signed in.");}
 async function logout(){await supabase?.auth.signOut();setUser(null);setMode("customer");}
 async function manageStaff(payload:Record<string,string>){
  if(!supabase)return null;
  const {data,error}=await supabase.functions.invoke("manage-staff-access",{body:payload});
  if(error||data?.error){setNotice(data?.error||error?.message||"Staff access request failed.");return null;}
  return data;
 }
 async function loadStaff(){
  if(!isAdmin)return;
  const data=await manageStaff({action:"list"});
  if(data)setStaff(data.users||[]);
 }
 async function inviteStaff(e:React.FormEvent){
  e.preventDefault();setBusy(true);
  const data=await manageStaff({action:"invite",email:inviteEmail,role:inviteRole});
  setBusy(false);
  if(data){setNotice("Invitation sent to "+inviteEmail+".");setInviteEmail("");void loadStaff();}
 }
 async function changeStaffRole(id:string,role:string){
  setBusy(true);const data=await manageStaff({action:"set_role",user_id:id,role});setBusy(false);
  if(data){setNotice("Staff role updated.");void loadStaff();}
 }
 async function checkout(){if(!supabase||!count||!storeOpen)return;setBusy(true);const items=menu.filter(i=>cart[i.id]>0).map(i=>({menu_item_id:i.id,quantity:cart[i.id]}));const {data,error}=await supabase.functions.invoke("create-guest-order",{body:{customer:{name:customer.trim(),phone:phone.trim()},items}});setBusy(false);if(error||!data?.order){setNotice(error?.message||data?.error||"Order could not be placed.");return;}setNotice("Order placed! Order #"+data.order.order_number+" · Pickup token "+data.order.pickup_token);setCart({});setCustomer("");setPhone("");}
 async function changeItemStatus(order:Order,itemId:string,next:string){
  if(!supabase)return;
  const patch:any={status:next};
  if(next==="ready")patch.ready_at=new Date().toISOString();
  if(next==="served")patch.served_at=new Date().toISOString();
  const {error}=await supabase.from("order_items").update(patch).eq("id",itemId);
  if(error){setNotice(error.message);return;}
  const {data,error:readError}=await supabase.from("order_items").select("status").eq("order_id",order.id);
  if(readError){setNotice(readError.message);return;}
  const states=(data||[]).map((x:any)=>x.status);
  const served=states.filter((x:string)=>x==="served").length;
  const readyOrServed=states.filter((x:string)=>x==="ready"||x==="served").length;
  const hasReady=states.some((x:string)=>x==="ready");
  const hasPreparing=states.some((x:string)=>x==="preparing");
  let overall="placed";
  if(states.length&&served===states.length)overall="completed";
  else if(served>0)overall="partially_served";
  else if(states.length&&readyOrServed===states.length)overall="ready";
  else if(hasReady)overall="partially_ready";
  else if(hasPreparing)overall="preparing";
  const {error:statusError}=await supabase.from("orders").update({status:overall}).eq("id",order.id);
  if(statusError)setNotice(statusError.message);else {setNotice("Item updated.");void loadOrders();}
 }
 async function toggleAvailability(i:MenuItem){if(!supabase)return;const {error}=await supabase.from("menu_items").update({is_available:!i.is_available}).eq("id",i.id);if(error)setNotice(error.message);else void loadMenu();}
 const visible=menu.filter(i=>i.is_available&&i.name.toLowerCase().includes(search.toLowerCase()));
 if(!supabase)return <main className="center"><h1>Food Cart OS</h1><p>Supabase configuration is missing. Add the project URL and publishable key to .env.local.</p></main>;
 return <div className="shell"><header><div className="brand">🍃 <b>{storeName}<span> OS</span></b></div><nav><button className={mode==="customer"?"active":""} onClick={()=>setMode("customer")}>Order food</button><button className={mode==="operator"?"active":""} onClick={()=>setMode("operator")}>Operator</button></nav><small className="cloud">● Cloud connected</small></header>
 {mode==="customer"?<main className="customer"><section className="hero"><div><small>FRESHLY MADE · READY FOR PICKUP</small><h1>Good food. No queue.</h1><p>Explore the menu and order directly from {storeName}.</p></div><strong>🥙</strong></section><div className="customer-columns"><section><div className="section-head"><div><h2>Our menu</h2><p>{storeOpen?"Accepting orders":"Currently not accepting orders"}</p></div><input placeholder="Search menu" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="menu-grid">{visible.map(i=><article className="food" key={i.id}><div className="food-emoji">🍽️</div><div className="food-details"><small>{i.category?.name||"Menu"}</small><h3>{i.name}</h3><p>{i.description}</p><div className="food-foot"><b>{money(Number(i.price))}</b><div className="qty"><button onClick={()=>setCart(c=>({...c,[i.id]:Math.max(0,(c[i.id]||0)-1)}))}>−</button><span>{cart[i.id]||0}</span><button onClick={()=>setCart(c=>({...c,[i.id]:(c[i.id]||0)+1}))}>+</button></div></div></div></article>)}</div>{!visible.length&&<p className="empty">No available items match your search.</p>}</section><aside className="cart"><h2>Your order <span>{count} items</span></h2>{!count?<p className="empty">Your cart is empty. Add something delicious.</p>:<><div className="cart-lines">{menu.filter(i=>cart[i.id]>0).map(i=><div key={i.id}><span>{cart[i.id]} × {i.name}</span><b>{money(i.price*cart[i.id])}</b></div>)}</div><div className="grand"><span>Subtotal</span><b>{money(total)}</b></div><label>Your name (optional)<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="Name"/></label><label>Phone (optional)<input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Phone number"/></label><button className="primary wide" disabled={busy||!storeOpen} onClick={checkout}>{busy?"Placing order…":"Place pickup order · "+money(total)}</button><small className="muted">Payment is not collected in this build. Pay at the counter.</small></>}</aside></div></main>:<main className="operator"><div className="op-head"><div><small>THE FOOD CART · WORKSPACE</small><h1>Operator dashboard</h1><p>Manage incoming orders and menu availability.</p></div>{user&&<button className="outline" onClick={logout}>Sign out</button>}</div>{!user?<form className="login" onSubmit={login}><h2>Staff sign in</h2><p>Use an authorised operator account.</p><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary wide" disabled={busy}>{busy?"Signing in…":"Sign in"}</button></form>:<><div className="tabs"><button className={tab==="Orders"?"selected":""} onClick={()=>setTab("Orders")}>Orders ({orders.filter(o=>!["completed","cancelled"].includes(o.status)).length})</button><button className={tab==="Menu"?"selected":""} onClick={()=>setTab("Menu")}>Menu ({menu.length})</button>{isAdmin&&<button className={tab==="Access"?"selected":""} onClick={()=>setTab("Access")}>Access management</button>}</div>{tab==="Orders"?<section className="panel"><div className="section-head"><div><h2>Order queue</h2><p>Automatically refreshes when orders change.</p></div><button className="outline" onClick={()=>void loadOrders()}>Refresh</button></div>{orders.length?orders.map(o=><article className="order" key={o.id}><div><b>#{o.order_number} · {o.customer_name||"Guest"}</b><small>{new Date(o.created_at).toLocaleString("en-IN")} · Token {o.pickup_token||"—"}</small><div className="order-items">{o.order_items?.map(x=><div className="order-item-row" key={x.id}><span>{x.quantity} × {x.item_name}</span><select aria-label={"Status for "+x.item_name} value={x.status||"pending"} onChange={e=>void changeItemStatus(o,x.id,e.target.value)}><option value="pending">Pending</option><option value="preparing">Preparing</option><option value="ready">Ready</option><option value="served">Served</option></select></div>)}</div></div><div className="order-action"><b>{money(Number(o.total_amount))}</b><span className={"status "+o.status}>{o.status}</span><small className="muted">Fulfil each item separately</small></div></article>):<p className="empty">No orders yet. New customer orders will appear here.</p>}</section>:tab==="Menu"?<section className="panel"><div className="section-head"><div><h2>Menu items</h2><p>Changes are saved directly to the cloud menu.</p></div><button className="outline" onClick={()=>void loadMenu()}>Refresh</button></div>{menu.map(i=><div className="menu-admin" key={i.id}><div><b>{i.name}</b><small>{i.category?.name||"Menu"} · {money(Number(i.price))}</small></div><button className={i.is_available?"availability on":"availability"} onClick={()=>void toggleAvailability(i)}>{i.is_available?"Available":"Unavailable"}</button></div>)}</section>:<section className="panel"><div className="section-head"><div><h2>Staff access</h2><p>Invite team members and control their permissions.</p></div><button className="outline" onClick={()=>void loadStaff()}>Refresh</button></div><form className="invite-form" onSubmit={inviteStaff}><label>Staff email<input type="email" required value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="name@example.com"/></label><label>Access level<select value={inviteRole} onChange={e=>setInviteRole(e.target.value)}><option value="operator">Operator</option><option value="admin">Admin</option></select></label><button className="primary" disabled={busy||!inviteEmail.trim()}>{busy?"Sending…":"Invite staff"}</button></form><p className="muted left">An invitation email lets the person set up their account. Admins can manage staff; Operators can manage orders and menu availability.</p><div className="staff-list"><div className="staff-row staff-head"><span>Team member</span><span>Access</span></div>{staff.map(person=><div className="staff-row" key={person.id}><div><b>{person.email||"No email"}</b><small>Joined {new Date(person.created_at).toLocaleDateString("en-IN")}{person.last_sign_in_at?" · Last active "+new Date(person.last_sign_in_at).toLocaleDateString("en-IN"):" · Not signed in yet"}</small></div><select disabled={busy||person.id===user.id} value={person.role} onChange={e=>void changeStaffRole(person.id,e.target.value)}><option value="customer">No access</option><option value="operator">Operator</option><option value="admin">Admin</option></select></div>)}</div></section>}</>}</main>}
 {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}</div>;
}
