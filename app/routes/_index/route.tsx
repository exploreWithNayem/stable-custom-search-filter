import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Stable Custom Filter &amp; Search</h1>
        <p className={styles.text}>
          Fast, customizable product filtering and search for your Shopify
          storefront — without shipping your catalog to the browser.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Every filter type</strong>. Checkboxes, colour and image
            swatches, price and numeric ranges, ratings, availability and
            metafields — grouped and ordered however you like.
          </li>
          <li>
            <strong>Instant, shareable results</strong>. AJAX filtering with
            Shopify-compatible URLs, so refresh, back, forward and sharing all
            keep the exact result set.
          </li>
          <li>
            <strong>Search that learns</strong>. Predictive search, synonyms and
            redirects, plus reporting on the terms that return nothing.
          </li>
        </ul>
      </div>
    </div>
  );
}
