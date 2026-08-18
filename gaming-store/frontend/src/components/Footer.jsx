import { Link } from 'react-router-dom';

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-brand">
          <div className="logo">NEXUS</div>
          <p>Your ultimate destination for gaming. Discover, play, and conquer.</p>
        </div>

        <div className="footer-column">
          <h4>Shop</h4>
          <ul>
            <li><Link to="/products">All Games</Link></li>
            <li><Link to="/categories">Categories</Link></li>
            <li><Link to="/products?featured=true">Featured</Link></li>
            <li><Link to="/products?search=sale">On Sale</Link></li>
          </ul>
        </div>

        <div className="footer-column">
          <h4>Account</h4>
          <ul>
            <li><Link to="/login">Login</Link></li>
            <li><Link to="/register">Sign Up</Link></li>
            <li><Link to="/cart">Cart</Link></li>
            <li><a href="#">Wishlist</a></li>
          </ul>
        </div>

        <div className="footer-column">
          <h4>Support</h4>
          <ul>
            <li><a href="#">Help Center</a></li>
            <li><a href="#">Contact Us</a></li>
            <li><a href="#">Privacy Policy</a></li>
            <li><a href="#">Terms of Service</a></li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <p>&copy; 2026 NEXUS Gaming. All rights reserved.</p>
      </div>
    </footer>
  );
}

export default Footer;