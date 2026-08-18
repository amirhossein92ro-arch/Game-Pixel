import { Link } from "react-router-dom";
import Hero from "../components/Hero";
import ProductCard from "../components/ProductCard";
import { products, categories } from "../data/products";
import "./Home.css";

const bestSellers = products.filter((p) => p.tags.includes("bestseller"));
const newArrivals = products.filter((p) => p.tags.includes("new"));
const topDeals = products.filter((p) => p.tags.includes("deal"));

export default function Home() {
  return (
    <main>
      <Hero />

      <section className="home-section">
        <div className="home-section__header">
          <div>
            <span className="home-section__label">FEATURED</span>
            <h2 className="home-section__title">Best Sellers</h2>
          </div>
          <Link to="/category/all" className="home-section__more">
            View All <i className="fa-solid fa-arrow-right" />
          </Link>
        </div>
        <div className="home-products">
          {bestSellers.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <section className="home-banner">
        <div className="home-banner__content">
          <span className="home-banner__badge">
            <i className="fa-solid fa-bolt" /> LIMITED TIME
          </span>
          <h2 className="home-banner__title">
            FLASH SALE — UP TO 25% OFF
          </h2>
          <p className="home-banner__text">
            Grab top-tier peripherals before the deal expires
          </p>
          <Link to="/category/all" className="home-banner__btn">
            Shop Deals
          </Link>
        </div>
        <div className="home-banner__glow" />
      </section>

      <section className="home-section">
        <div className="home-section__header">
          <div>
            <span className="home-section__label">JUST DROPPED</span>
            <h2 className="home-section__title">New Arrivals</h2>
          </div>
          <Link to="/category/all" className="home-section__more">
            View All <i className="fa-solid fa-arrow-right" />
          </Link>
        </div>
        <div className="home-products">
          {newArrivals.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <section className="home-categories">
        <span className="home-section__label">BROWSE BY</span>
        <h2 className="home-section__title">Categories</h2>
        <div className="home-categories__grid">
          {categories.filter((c) => c.id !== "all").map((cat) => (
            <Link
              key={cat.id}
              to={`/category/${cat.id}`}
              className="home-cat"
            >
              <i className={`fa-solid ${cat.icon}`} />
              <span>{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section__header">
          <div>
            <span className="home-section__label">DON'T MISS</span>
            <h2 className="home-section__title">Top Deals</h2>
          </div>
          <Link to="/category/all" className="home-section__more">
            View All <i className="fa-solid fa-arrow-right" />
          </Link>
        </div>
        <div className="home-products">
          {topDeals.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <section className="home-newsletter">
        <div className="home-newsletter__icon">
          <i className="fa-solid fa-envelope" />
        </div>
        <h2>Stay in the Loop</h2>
        <p>Get early access to deals, new product drops, and exclusive offers.</p>
        <form className="home-newsletter__form" onSubmit={(e) => e.preventDefault()}>
          <input type="email" placeholder="Enter your email" />
          <button type="submit">Subscribe</button>
        </form>
      </section>
    </main>
  );
}
