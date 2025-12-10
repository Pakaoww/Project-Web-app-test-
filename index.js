const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
	secret: 'replace-with-secure-secret',
	resave: false,
	saveUninitialized: false,
	cookie: { 
		maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
		httpOnly: true,
		sameSite: 'lax'
	}
}));

// Serve static frontend (default index.html will be served as homepage)
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// Load sample products (simple JSON file)
const products = require('./data/products.json');

// Initialize SQLite Databases
const fs = require('fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

// Auth database - stores login credentials
const authDbFile = path.join(dataDir, 'auth.db');
const authDb = new sqlite3.Database(authDbFile);
authDb.serialize(() => {
	authDb.run(`CREATE TABLE IF NOT EXISTS credentials (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		email TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`);
});

// User data database - stores user profile information
const userDbFile = path.join(dataDir, 'users.db');
const userDb = new sqlite3.Database(userDbFile);
userDb.serialize(() => {
	userDb.run(`CREATE TABLE IF NOT EXISTS profiles (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER UNIQUE NOT NULL,
		first_name TEXT,
		last_name TEXT,
		phone TEXT,
		address TEXT,
		city TEXT,
		postal_code TEXT,
		country TEXT DEFAULT 'Thailand',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`);

	// Orders tables
	userDb.run(`CREATE TABLE IF NOT EXISTS orders (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		status TEXT DEFAULT 'pending',
		total REAL NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`);
	userDb.run(`CREATE TABLE IF NOT EXISTS order_items (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		order_id INTEGER NOT NULL,
		product_id INTEGER NOT NULL,
		title TEXT NOT NULL,
		price REAL NOT NULL,
		qty INTEGER NOT NULL
	)`);
});

// Auth helpers
function requireAuth(req, res, next){
	if (req.session && req.session.user) return next();
	res.status(401).json({ error: 'Unauthorized' });
}

app.post('/api/register', async (req, res) => {
	const { username, email, password } = req.body;
	if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });
	try {
		const hash = await bcrypt.hash(password, 10);
		// Insert into auth database
		authDb.run('INSERT INTO credentials (username, email, password) VALUES (?, ?, ?)', [username, email, hash], function(err){
			if (err) return res.status(400).json({ error: 'Username or email already taken' });
			const userId = this.lastID;
			// Create user profile in user database
			userDb.run('INSERT INTO profiles (user_id) VALUES (?)', [userId], (err) => {
				if (err) return res.status(500).json({ error: 'Profile creation failed' });
				req.session.user = { id: userId, username, email };
				res.json({ id: userId, username, email });
			});
		});
	} catch (e) {
		res.status(500).json({ error: 'Server error' });
	}
});

app.post('/api/login', (req, res) => {
	const { username, password } = req.body;
	if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
	authDb.get('SELECT id, username, email, password FROM credentials WHERE username = ?', [username], async (err, row) => {
		if (err) return res.status(500).json({ error: 'Server error' });
		if (!row) return res.status(400).json({ error: 'Invalid credentials' });
		const ok = await bcrypt.compare(password, row.password);
		if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
		req.session.user = { id: row.id, username: row.username, email: row.email };
		res.json({ id: row.id, username: row.username, email: row.email });
	});
});

app.post('/api/logout', (req, res) => {
	req.session.destroy(err => {
		if (err) return res.status(500).json({ error: 'Logout failed' });
		res.json({ ok: true });
	});
});

app.get('/api/me', (req, res) => {
	if (req.session && req.session.user) return res.json(req.session.user);
	res.status(401).json({ error: 'Not logged in' });
});

// Check auth status (for navbar)
app.get('/api/check-auth', (req, res) => {
	if (req.session && req.session.user) {
		res.json({ authenticated: true, user: req.session.user });
	} else {
		res.json({ authenticated: false });
	}
});

// Update email
app.post('/api/update-email', requireAuth, (req, res) => {
	const { email } = req.body;
	const userId = req.session.user.id;
	
	if (!email || !email.includes('@')) {
		return res.status(400).json({ error: 'Invalid email' });
	}
	
	// Check if email already exists
	authDb.get('SELECT id FROM credentials WHERE email = ? AND id != ?', [email, userId], (err, row) => {
		if (err) return res.status(500).json({ error: 'Server error' });
		if (row) return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' });
		
		// Update email in auth database
		authDb.run('UPDATE credentials SET email = ? WHERE id = ?', [email, userId], (err) => {
			if (err) return res.status(500).json({ error: 'Update failed' });
			
			// Update session
			req.session.user.email = email;
			res.json({ ok: true, email });
		});
	});
});

// Get user profile
app.get('/api/profile/:id', (req, res) => {
	const userId = req.params.id;
	userDb.get('SELECT * FROM profiles WHERE user_id = ?', [userId], (err, row) => {
		if (err) return res.status(500).json({ error: 'Server error' });
		if (!row) return res.json({ user_id: userId });
		res.json(row);
	});
});

// Update user profile
app.post('/api/profile/:id', requireAuth, (req, res) => {
	if (String(req.session.user.id) !== String(req.params.id)) {
		return res.status(403).json({ error: 'Forbidden' });
	}
	const { first_name, last_name, phone, address, city, postal_code, country } = req.body;
	const userId = req.params.id;
	userDb.run(
		`INSERT OR REPLACE INTO profiles (user_id, first_name, last_name, phone, address, city, postal_code, country, updated_at) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		[userId, first_name, last_name, phone, address, city, postal_code, country],
		(err) => {
			if (err) return res.status(500).json({ error: 'Update failed' });
			res.json({ ok: true });
		}
	);
});

// API: list all brands
app.get('/api/brands', (req, res) => {
	const brands = [...new Set(products.map(p => p.brand))].sort();
	res.json(brands);
});

// API: list products, optional ?brand=BrandName
app.get('/api/products', (req, res) => {
	const brand = req.query.brand;
	const result = brand ? products.filter(p => p.brand === brand) : products;
	res.json(result);
});

// API: get single product by id
app.get('/api/products/:id', (req, res) => {
	const id = req.params.id;
	const product = products.find(p => String(p.id) === String(id));
	if (!product) return res.status(404).json({ error: 'Not found' });
	res.json(product);
});

// Cart endpoints (session-based)
// Cart endpoints - require authentication
app.get('/api/cart', requireAuth, (req, res) => {
	req.session.cart = req.session.cart || [];
	res.json(req.session.cart);
});

app.post('/api/cart', requireAuth, (req, res) => {
	const { id, qty } = req.body;
	if (!id) return res.status(400).json({ error: 'Missing id' });
	const product = products.find(p => String(p.id) === String(id));
	if (!product) return res.status(400).json({ error: 'Invalid product id' });
	req.session.cart = req.session.cart || [];
	const existing = req.session.cart.find(i => String(i.id) === String(id));
	if (existing) {
		existing.qty = Math.max(1, (existing.qty || 0) + (parseInt(qty) || 1));
	} else {
		req.session.cart.push({ id: product.id, title: product.title, price: product.price, qty: parseInt(qty) || 1 });
	}
	res.json(req.session.cart);
});

app.post('/api/cart/clear', requireAuth, (req, res) => {
	req.session.cart = [];
	res.json({ ok: true });
});

// Checkout endpoints
// Validate profile has required fields
function hasCompleteProfile(profile){
	return profile && profile.address && profile.city && profile.postal_code && profile.country;
}

// Get checkout summary
app.get('/api/checkout', requireAuth, async (req, res) => {
	try {
		const userId = req.session.user.id;
		const cart = req.session.cart || [];
		if (!cart.length) return res.status(400).json({ error: 'Cart is empty' });
		const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
		userDb.get('SELECT * FROM profiles WHERE user_id = ?', [userId], (err, profile) => {
			if (err) return res.status(500).json({ error: 'Server error' });
			res.json({ cart, total, profile });
		});
	} catch(e){
		res.status(500).json({ error: 'Server error' });
	}
});

// Place order (COD / bank transfer placeholder)
app.post('/api/checkout', requireAuth, async (req, res) => {
	const userId = req.session.user.id;
	const cart = req.session.cart || [];
	if (!cart.length) return res.status(400).json({ error: 'Cart is empty' });
	const { note, delivery } = req.body || {};

	// Ensure profile complete for shipping
	userDb.get('SELECT * FROM profiles WHERE user_id = ?', [userId], (err, profile) => {
		if (err) return res.status(500).json({ error: 'Server error' });
		if (!hasCompleteProfile(profile)) {
			return res.status(400).json({ error: 'กรุณากรอกข้อมูลที่อยู่ให้ครบถ้วน' });
		}

		const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
		userDb.run('INSERT INTO orders (user_id, status, total) VALUES (?, ?, ?)', [userId, 'pending', total], function(err){
			if (err) return res.status(500).json({ error: 'Order creation failed' });
			const orderId = this.lastID;
			const stmt = userDb.prepare('INSERT INTO order_items (order_id, product_id, title, price, qty) VALUES (?, ?, ?, ?, ?)');
			try {
				cart.forEach(item => {
					stmt.run(orderId, item.id, item.title, item.price, item.qty);
				});
				stmt.finalize((e) => {
					if (e) return res.status(500).json({ error: 'Order items failed' });
					// Clear cart after order
					req.session.cart = [];
					// Optionally, store note/delivery by adding columns in future
					res.json({ ok: true, order_id: orderId });
				});
			} catch(e){
				res.status(500).json({ error: 'Order items error' });
			}
		});
	});
});

// Get my orders
app.get('/api/orders', requireAuth, (req, res) => {
	const userId = req.session.user.id;
	userDb.all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, rows) => {
		if (err) return res.status(500).json({ error: 'Server error' });
		res.json(rows || []);
	});
});

// Get single order with items
app.get('/api/orders/:id', requireAuth, (req, res) => {
	const orderId = req.params.id;
	userDb.get('SELECT * FROM orders WHERE id = ? AND user_id = ?', [orderId, req.session.user.id], (err, order) => {
		if (err) return res.status(500).json({ error: 'Server error' });
		if (!order) return res.status(404).json({ error: 'Not found' });
		userDb.all('SELECT * FROM order_items WHERE order_id = ?', [orderId], (e, items) => {
			if (e) return res.status(500).json({ error: 'Server error' });
			res.json({ order, items });
		});
	});
});

// Serve dashboard HTML only when authenticated
app.get('/dashboard', (req, res, next) => {
	if (!req.session || !req.session.user) return res.redirect('/login.html');
	res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Fallback for SPA (serve index) - ignore API routes
app.use((req, res, next) => {
	if (req.path.startsWith('/api/')) return next();
	if (req.method !== 'GET') return next();
	res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

