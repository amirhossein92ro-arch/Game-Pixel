import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useCart } from "../context/CartContext";
import "./Header.css";

export default function Header() {
  const { totalItems } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  return (
    <header className={`header ${scrolled ? "header--scrolled" : ""}`}>
      <div className="header__inner">
        <Link to="/" className="header__logo">
          <span className="header__logo-icon">
            <i className="fa-solid fa-bolt" />
          </span>
          <span className="header__logo-text">
            NEX<span className="header__logo-accent">PLAY</span>
          </span>
        </Link>

        <nav className={`header__nav ${menuOpen ? "header__nav--open" : ""}`}>
          <Link to="/" className="header__link">
            Home
          </Link>
          <Link to="/category/all" className="header__link">
            Shop
          </Link>
          <Link to="/category/all" className="header__link">
            Deals
          </Link>
        </nav>

        <div className="header__actions">
          <Link to="/cart" className="header__cart">
            <i className="fa-solid fa-bag-shopping" />
            {totalItems > 0 && (
              <span className="header__cart-badge">{totalItems}</span>
            )}
          </Link>
          <button
            className="header__menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <i className={`fa-solid ${menuOpen ? "fa-xmark" : "fa-bars"}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
