import { Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { formatPrice, getDiscount } from "../data/products";
import "./ProductCard.css";

export default function ProductCard({ product }) {
  const { addItem } = useCart();
  const discount = getDiscount(product.originalPrice, product.price);

  return (
    <div className="pcard">
      <Link to={`/product/${encodeURIComponent(product.id)}`} className="pcard__link">
        <div className="pcard__image">
          <i className={`fa-solid ${product.icon}`} />
          {product.tags.includes("new") && (
            <span className="pcard__tag pcard__tag--new">NEW</span>
          )}
          {product.tags.includes("deal") && (
            <span className="pcard__tag pcard__tag--deal">-{discount}%</span>
          )}
          {product.tags.includes("bestseller") && (
            <span className="pcard__tag pcard__tag--hot">HOT</span>
          )}
        </div>
        <div className="pcard__body">
          <span className="pcard__category">{product.category}</span>
          <h3 className="pcard__name">{product.name}</h3>
          <p className="pcard__desc">{product.desc}</p>
          <div className="pcard__rating">
            <span className="pcard__stars">
              {Array.from({ length: 5 }, (_, i) => (
                <i
                  key={i}
                  className={`fa-solid fa-star ${i < Math.round(product.rating) ? "" : "pcard__star--empty"}`}
                />
              ))}
            </span>
            <span className="pcard__reviews">({product.reviews})</span>
          </div>
          <div className="pcard__price-row">
            <span className="pcard__price">{formatPrice(product.price)}</span>
            {discount > 0 && (
              <span className="pcard__original">
                {formatPrice(product.originalPrice)}
              </span>
            )}
          </div>
        </div>
      </Link>
      <div className="pcard__footer">
        <span className="pcard__stock">
          {product.stock > 10
            ? "In Stock"
            : product.stock > 0
              ? `Only ${product.stock} left`
              : "Out of Stock"}
        </span>
        <button
          className="pcard__add"
          onClick={() => addItem(product)}
          disabled={product.stock === 0}
        >
          <i className="fa-solid fa-cart-plus" /> Add
        </button>
      </div>
    </div>
  );
}
