async function postJSON(url, data){
  const res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)});
  const json = await res.json();
  return { ok: res.ok, data: json };
}

document.addEventListener('DOMContentLoaded', ()=>{
  const reg = document.getElementById('register-form');
  const login = document.getElementById('login-form');
  if (reg) reg.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const errorEl = document.getElementById('error-message');
    const fd = new FormData(reg);
    const username = fd.get('username');
    const email = fd.get('email');
    const password = fd.get('password');
    
    // Basic validation
    if (!username || !email || !password) {
      errorEl.textContent = 'กรุณากรอกข้อมูลให้ครบทั้งหมด';
      errorEl.classList.remove('hidden');
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
      errorEl.classList.remove('hidden');
      return;
    }
    
    const r = await postJSON('/api/register', { username, email, password });
    if (r.ok) {
      window.location = '/';
    } else {
      errorEl.textContent = r.data.error || 'สมัครไม่สำเร็จ กรุณาลองใหม่';
      errorEl.classList.remove('hidden');
    }
  });
  
  if (login) login.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const errorEl = document.getElementById('login-form').parentElement.querySelector('.error-message') || (() => {
      const el = document.createElement('div');
      el.className = 'error-message hidden';
      document.getElementById('login-form').parentElement.insertBefore(el, document.getElementById('login-form'));
      return el;
    })();
    const fd = new FormData(login);
    const username = fd.get('username');
    const password = fd.get('password');
    const r = await postJSON('/api/login', { username, password });
    if (r.ok) {
      window.location = '/';
    } else {
      errorEl.textContent = r.data.error || 'เข้าสู่ระบบไม่สำเร็จ';
      errorEl.classList.remove('hidden');
    }
  });
});
