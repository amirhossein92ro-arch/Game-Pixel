import { Link } from "react-router-dom";
import { products, formatPrice } from "../data/products";
import { useCart } from "../context/CartContext";
import "./Hero.css";

const featured = products.filter((p) => p.rating >= 4.8).slice(0, 3);

export default function Hero() {
  const { addItem } = useCart();

  return (
    <section className="hero">
      <div className="hero__bg">
        <div className="hero__grid" />
        <div className="hero__glow hero__glow--1" />
        <div className="hero__glow hero__glow--2" />
      </div>

      <div className="hero__content">
        <div className="hero__badge">
          <i className="fa-solid fa-fire" /> Level Up Your Setup
        </div>
        <h1 className="hero__title">
          GEAR THAT
          <br />
          <span className="hero__title-accent">DOMINATES</span>
        </h1>
        <p className="hero__subtitle">
          Premium gaming peripherals and accessories. Built for winners.
        </p>
        <div className="hero__actions">
          <Link to="/category/all" className="hero__btn hero__btn--primary">
            <i className="fa-solid fa-gamepad" /> Shop Now
          </Link>
          <Link to="/category/all" className="hero__btn hero__btn--ghost">
            Browse Deals
          </Link>
        </div>
      </div>

      <div className="hero__featured">
        {featured.map((p) => (
          <div key={p.id} className="hero__card">
            <div className="hero__card-icon">
              <i className={`fa-solid ${p.icon}`} />
            </div>
            <div className="hero__card-info">
              <span className="hero__card-name">{p.name}</span>
              <span className="hero__card-price">{formatPrice(p.price)}</span>
            </div>
            <button
              className="hero__card-btn"
              onClick={() => addItem(p)}
              aria-label={`Add ${p.name} to cart`}
            >
              <i className="fa-solid fa-plus" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
