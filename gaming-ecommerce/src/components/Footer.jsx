import { Link } from "react-router-dom";
import "./Footer.css";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__brand">
          <span className="footer__logo">
            <i className="fa-solid fa-bolt" />
            NEX<span>PLAY</span>
          </span>
          <p className="footer__tagline">
            Premium gaming gear for competitive players.
          </p>
        </div>

        <div className="footer__links">
          <h4>Shop</h4>
          <Link to="/category/peripherals">Peripherals</Link>
          <Link to="/category/audio">Audio</Link>
          <Link to="/category/controllers">Controllers</Link>
          <Link to="/category/displays">Displays</Link>
        </div>

        <div className="footer__links">
          <h4>Company</h4>
          <a href="#">About</a>
          <a href="#">Careers</a>
          <a href="#">Press</a>
          <a href="#">Blog</a>
        </div>

        <div className="footer__links">
          <h4>Support</h4>
          <a href="#">Help Center</a>
          <a href="#">Warranty</a>
          <a href="#">Returns</a>
          <a href="#">Contact</a>
        </div>
      </div>

      <div className="footer__bottom">
        <p>&copy; 2026 NexPlay. All rights reserved.</p>
        <div className="footer__socials">
          <a href="#" aria-label="Twitter">
            <i className="fa-brands fa-x-twitter" />
          </a>
          <a href="#" aria-label="Discord">
            <i className="fa-brands fa-discord" />
          </a>
          <a href="#" aria-label="Twitch">
            <i className="fa-brands fa-twitch" />
          </a>
          <a href="#" aria-label="YouTube">
            <i className="fa-brands fa-youtube" />
          </a>
        </div>
      </div>
    </footer>
  );
}
