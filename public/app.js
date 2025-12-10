async function api(path, opts){
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error('API error');
  return res.json();
}

const brandsEl = document.getElementById('brands');
const productsEl = document.getElementById('products');
const cartCountEl = document.getElementById('cart-count');
const cartDrawer = document.getElementById('cart-drawer');
const cartItemsEl = document.getElementById('cart-items');
const authUserEl = document.getElementById('auth-user');
const signinLinkEl = document.getElementById('signin-link');
const usernameDisplayEl = document.getElementById('username-display');
const logoutLinkEl = document.getElementById('logout-link');

// Check auth status and update navbar
async function checkAuth(){
  try {
    const res = await fetch('/api/check-auth');
    const data = await res.json();
    if (data.authenticated) {
      authUserEl.classList.remove('hidden');
      signinLinkEl.classList.add('hidden');
      const username = data.user.username;
      const initials = username.charAt(0).toUpperCase();
      const avatarEl = document.getElementById('profile-avatar');
      const nameEl = document.getElementById('profile-username-nav');
      if (avatarEl) avatarEl.textContent = initials;
      if (nameEl) nameEl.textContent = username;
    } else {
      authUserEl.classList.add('hidden');
      signinLinkEl.classList.remove('hidden');
    }
  } catch (e) {
    console.error('Auth check failed', e);
  }
}

document.getElementById('open-cart').addEventListener('click', ()=>{
  cartDrawer.classList.toggle('hidden');
});
document.getElementById('clear-cart').addEventListener('click', async ()=>{
  await api('/api/cart/clear', { method: 'POST' });
  await loadCart();
});

logoutLinkEl.addEventListener('click', async (e)=>{
  e.preventDefault();
  await api('/api/logout', { method: 'POST' });
  window.location = '/login.html';
});

async function loadBrands(){
  const brands = await api('/api/brands');
  brandsEl.innerHTML = '<button data-brand="">ทั้งหมด</button>' + brands.map(b=>`<button data-brand="${b}">${b}</button>`).join('');
  brandsEl.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      brandsEl.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
      btn.classList.add('active');
      loadProducts(btn.dataset.brand);
    });
  });
}

async function loadProducts(brand){
  const url = brand ? `/api/products?brand=${encodeURIComponent(brand)}` : '/api/products';
  const products = await api(url);
  productsEl.innerHTML = products.map(p=>`
    <div class="card">
      <img src="${p.img}" alt="${p.title}">
      <h3>${p.title}</h3>
      <div class="small">${p.brand}</div>
      <div class="price">$${p.price.toFixed(2)}</div>
      <button data-id="${p.id}">เพิ่มไปยังตะกร้า</button>
    </div>
  `).join('');
  productsEl.querySelectorAll('button[data-id]').forEach(b=>{
    b.addEventListener('click', async ()=>{
      try {
        await api('/api/cart', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id: b.dataset.id, qty: 1 }) });
        await loadCart();
        cartDrawer.classList.remove('hidden');
      } catch (e) {
        alert('กรุณาเข้าสู่ระบบเพื่อเพิ่มสินค้าลงตะกร้า');
        window.location = '/login.html';
      }
    });
  });
}

async function loadCart(){
  try {
    const cart = await api('/api/cart');
    cartItemsEl.innerHTML = cart.length ? cart.map(i=>`<div class="cart-item"><div>${i.title} x${i.qty}</div><div>$${(i.price*i.qty).toFixed(2)}</div></div>`).join('') : '<div class="small">ตะกร้าว่าง</div>';
    const count = cart.reduce((s,i)=>s+(i.qty||0),0);
    cartCountEl.textContent = count;
  } catch (e) {
    cartItemsEl.innerHTML = '<div class="small">กรุณาเข้าสู่ระบบ</div>';
  }
}

(async function init(){
  await checkAuth();
  await loadBrands();
  await loadProducts();
  try {
    await loadCart();
  } catch (e) {
    // Not authenticated, cart will be empty
  }

  const checkoutBtn = document.getElementById('checkout');
  if (checkoutBtn){
    checkoutBtn.addEventListener('click', async ()=>{
      // Require login
      const meRes = await fetch('/api/me');
      if (!meRes.ok){
        alert('กรุณาเข้าสู่ระบบก่อนเช็คเอาท์');
        window.location = '/login.html';
        return;
      }
      window.location = '/checkout.html';
    });
  }
})();
