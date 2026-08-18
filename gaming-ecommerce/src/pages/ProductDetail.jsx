import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { products, formatPrice, getDiscount, categories } from "../data/products";
import { useCart } from "../context/CartContext";
import "./ProductDetail.css";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);
  const [activeTab, setActiveTab] = useState("specs");

  const product = products.find((p) => p.id === Number(id));

  if (!product) {
    return (
      <main className="pd-not-found">
        <h1>Product Not Found</h1>
        <p>The product you're looking for doesn't exist.</p>
        <Link to="/" className="pd-back">
          <i className="fa-solid fa-arrow-left" /> Back to Home
        </Link>
      </main>
    );
  }

  const discount = getDiscount(product.originalPrice, product.price);
  const related = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const handleAdd = () => {
    for (let i = 0; i < qty; i++) addItem(product);
  };

  return (
    <main className="pd">
      <div className="pd__breadcrumb">
        <Link to="/">Home</Link>
        <i className="fa-solid fa-chevron-right" />
        <Link to={`/category/${product.category}`}>
          {categories.find((c) => c.id === product.category)?.name}
        </Link>
        <i className="fa-solid fa-chevron-right" />
        <span>{product.name}</span>
      </div>

      <div className="pd__main">
        <div className="pd__gallery">
          <div className="pd__image-main">
            <i className={`fa-solid ${product.icon}`} />
            {discount > 0 && (
              <span className="pd__discount-badge">-{discount}%</span>
            )}
          </div>
          <div className="pd__gallery-thumbs">
            {[1, 2, 3].map((n) => (
              <div key={n} className="pd__thumb">
                <i className={`fa-solid ${product.icon}`} />
              </div>
            ))}
          </div>
        </div>

        <div className="pd__info">
          <div className="pd__tags">
            {product.tags.map((tag) => (
              <span key={tag} className={`pd__tag pd__tag--${tag}`}>
                {tag.toUpperCase()}
              </span>
            ))}
          </div>

          <h1 className="pd__name">{product.name}</h1>

          <div className="pd__rating">
            <span className="pd__stars">
              {Array.from({ length: 5 }, (_, i) => (
                <i
                  key={i}
                  className={`fa-solid fa-star ${i < Math.round(product.rating) ? "" : "pd__star--empty"}`}
                />
              ))}
            </span>
            <span className="pd__rating-value">{product.rating}</span>
            <span className="pd__review-count">({product.reviews} reviews)</span>
          </div>

          <p className="pd__desc">{product.desc}</p>

          <div className="pd__price-box">
            <span className="pd__price">{formatPrice(product.price)}</span>
            {discount > 0 && (
              <>
                <span className="pd__original">
                  {formatPrice(product.originalPrice)}
                </span>
                <span className="pd__save">Save {formatPrice(product.originalPrice - product.price)}</span>
              </>
            )}
          </div>

          <div className="pd__stock">
            <i className="fa-solid fa-circle-check" />
            {product.stock > 10
              ? "In Stock"
              : product.stock > 0
                ? `Only ${product.stock} left in stock`
                : "Out of Stock"}
          </div>

          <div className="pd__qty-row">
            <label className="pd__qty-label">Quantity</label>
            <div className="pd__qty">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                disabled={qty <= 1}
              >
                <i className="fa-solid fa-minus" />
              </button>
              <span>{qty}</span>
              <button
                onClick={() => setQty(Math.min(product.stock, qty + 1))}
                disabled={qty >= product.stock}
              >
                <i className="fa-solid fa-plus" />
              </button>
            </div>
          </div>

          <div className="pd__actions">
            <button className="pd__add-btn" onClick={handleAdd}>
              <i className="fa-solid fa-cart-plus" /> Add to Cart
            </button>
            <button className="pd__wish-btn">
              <i className="fa-regular fa-heart" />
            </button>
          </div>

          <div className="pd__perks">
            <div className="pd__perk">
              <i className="fa-solid fa-truck-fast" />
              <span>Free shipping on orders over $200</span>
            </div>
            <div className="pd__perk">
              <i className="fa-solid fa-shield-halved" />
              <span>2-year warranty included</span>
            </div>
            <div className="pd__perk">
              <i className="fa-solid fa-rotate-left" />
              <span>30-day money back guarantee</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pd__tabs">
        <div className="pd__tab-nav">
          <button
            className={`pd__tab-btn ${activeTab === "specs" ? "pd__tab-btn--active" : ""}`}
            onClick={() => setActiveTab("specs")}
          >
            Specifications
          </button>
          <button
            className={`pd__tab-btn ${activeTab === "details" ? "pd__tab-btn--active" : ""}`}
            onClick={() => setActiveTab("details")}
          >
            Details
          </button>
          <button
            className={`pd__tab-btn ${activeTab === "reviews" ? "pd__tab-btn--active" : ""}`}
            onClick={() => setActiveTab("reviews")}
          >
            Reviews ({product.reviews})
          </button>
        </div>

        <div className="pd__tab-content">
          {activeTab === "specs" && (
            <table className="pd__specs">
              <tbody>
                {Object.entries(product.specs).map(([key, val]) => (
                  <tr key={key}>
                    <td>{key}</td>
                    <td>{val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {activeTab === "details" && (
            <p className="pd__detail-text">{product.desc}</p>
          )}
          {activeTab === "reviews" && (
            <div className="pd__reviews-placeholder">
              <i className="fa-solid fa-comments" />
              <p>Customer reviews coming soon.</p>
            </div>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="pd__related">
          <h2 className="pd__related-title">You May Also Like</h2>
          <div className="pd__related-grid">
            {related.map((p) => (
              <Link
                key={p.id}
                to={`/product/${p.id}`}
                className="pd__related-card"
                onClick={() => window.scrollTo(0, 0)}
              >
                <div className="pd__related-icon">
                  <i className={`fa-solid ${p.icon}`} />
                </div>
                <h3>{p.name}</h3>
                <span className="pd__related-price">{formatPrice(p.price)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
