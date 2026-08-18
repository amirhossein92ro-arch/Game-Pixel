import { useParams } from "react-router-dom";
import { useState } from "react";
import ProductCard from "../components/ProductCard";
import { products, categories } from "../data/products";
import "./Category.css";

const SORT_OPTIONS = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "rating", label: "Top Rated" },
  { value: "newest", label: "Newest" },
];

export default function Category() {
  const { categoryId } = useParams();
  const [sortBy, setSortBy] = useState("featured");
  const [searchQuery, setSearchQuery] = useState("");

  const category = categories.find((c) => c.id === categoryId);
  const isAll = categoryId === "all";

  let filtered = isAll
    ? products
    : products.filter((p) => p.category === categoryId);

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.desc.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "price-asc":
        return a.price - b.price;
      case "price-desc":
        return b.price - a.price;
      case "rating":
        return b.rating - a.rating;
      case "newest":
        return b.id - a.id;
      default:
        return 0;
    }
  });

  return (
    <main className="cat">
      <div className="cat__header">
        <div>
          <span className="cat__label">{isAll ? "ALL PRODUCTS" : "CATEGORY"}</span>
          <h1 className="cat__title">
            {isAll ? "All Products" : category?.name || categoryId}
          </h1>
          <p className="cat__count">
            {sorted.length} product{sorted.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="cat__filters">
        <div className="cat__search">
          <i className="fa-solid fa-magnifying-glass" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="cat__sort">
          <label>Sort by:</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="cat__nav">
        {categories.map((cat) => (
          <a
            key={cat.id}
            href={`/category/${cat.id}`}
            className={`cat__nav-item ${cat.id === categoryId ? "cat__nav-item--active" : ""}`}
          >
            <i className={`fa-solid ${cat.icon}`} />
            {cat.name}
          </a>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="cat__empty">
          <i className="fa-solid fa-magnifying-glass" />
          <h3>No products found</h3>
          <p>Try a different search or browse another category.</p>
        </div>
      ) : (
        <div className="cat__grid">
          {sorted.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </main>
  );
}
