"use client";

import { profileSaleFieldsError, readSaleDetail, updateSaleDetail, type SaleDetailLabel } from "../lib/profile-sale";
import { useUiText } from "./UiTextProvider";
import styles from "./ProfileSaleFields.module.css";

type Detail = { id: string; label: string; value: string };
type ItemLink = { id: string; label: string; url: string };

export function ProfileSaleFields({ fields, links, onFieldsChange, onLinksChange }: {
  fields: Detail[];
  links: ItemLink[];
  onFieldsChange: (fields: Detail[]) => void;
  onLinksChange: (links: ItemLink[]) => void;
}) {
  const ui = useUiText("components.ProfileSaleFields");
  const value = (label: SaleDetailLabel) => readSaleDetail({ customFields: fields }, label);
  const change = (label: SaleDetailLabel, next: string) => onFieldsChange(updateSaleDetail(fields, label, next));
  const shopLinks = links.filter((link) => link.label.trim().toLowerCase() === "shop");
  const itemUrl = shopLinks.length === 1 ? shopLinks[0].url : "";
  const error = profileSaleFieldsError({ saleStatus: "for_sale", customFields: fields, customLinks: links });
  const changeItemUrl = (url: string) => {
    const otherLinks = links.filter((link) => link.label.trim().toLowerCase() !== "shop");
    if (url.trim() !== itemUrl.trim()) {
      onFieldsChange(updateSaleDetail(fields, "Store item ID", ""));
    }
    onLinksChange(url ? [...otherLinks, { id: shopLinks[0]?.id || "sale-shop-link", label: "Shop", url }] : otherLinks);
  };
  const field = (label: SaleDetailLabel, caption: string, props = {}) => <label className="field">
    <span>{caption}</span><input value={value(label)} onChange={(event) => change(label, event.target.value)} {...props} />
  </label>;
  return <details className={styles.saleFields} id="sale-details" open>
    <summary>{ui("ui.components.ProfileSaleFields.title", "Sale details")}</summary>
    <div className="form-grid">
      {field("Asking price", ui("ui.components.ProfileSaleFields.price", "Asking price"), { inputMode: "decimal", placeholder: "2500.00", maxLength: 13 })}
      <label className="field"><span>{ui("ui.components.ProfileSaleFields.currency", "Currency")}</span>
        <select value={value("Currency").toUpperCase()} onChange={(event) => change("Currency", event.target.value)}>
          <option value="">{ui("ui.components.ProfileSaleFields.chooseCurrency", "Choose currency")}</option>
          {Array.from(new Set(["USD", "CAD", "EUR", "GBP", "AUD", "JPY", ...Intl.supportedValuesOf("currency")])).map((currency) => <option value={currency} key={currency}>{currency}</option>)}
        </select>
      </label>
      {field("Store name", ui("ui.components.ProfileSaleFields.store", "Store name (optional)"), { maxLength: 80 })}
      <label className="field"><span>{ui("ui.components.ProfileSaleFields.item", "This instrument’s store page")}</span>
        <input type="url" placeholder="https://" value={itemUrl} onChange={(event) => changeItemUrl(event.target.value)} maxLength={500} />
      </label>
      <label className="field"><span>{ui("ui.components.ProfileSaleFields.destination", "Purchase destination")}</span>
        <select value={value("Store platform") || "listing"} onChange={(event) => change("Store platform", event.target.value)}>
          <option value="listing">{ui("ui.components.ProfileSaleFields.listing", "Instrument page at the store")}</option>
          <option value="woocommerce">{ui("ui.components.ProfileSaleFields.woo", "WooCommerce cart")}</option>
        </select>
      </label>
      {value("Store platform") === "woocommerce" ? <>
        {field("Store cart URL", ui("ui.components.ProfileSaleFields.cart", "Store cart page URL"), { type: "url", placeholder: "https://", maxLength: 500 })}
        {field("Store item ID", ui("ui.components.ProfileSaleFields.itemId", "Product or variation ID"), { inputMode: "numeric", maxLength: 20 })}
      </> : null}
    </div>
    <p className="fine-print">{ui("ui.components.ProfileSaleFields.help", "Review the instrument page and item mapping before offering it for sale. The buyer completes the purchase at your store.")}</p>
    {error ? <p role="status" className="fine-print">{error}</p> : null}
    {value("Store platform") === "woocommerce" ? <p className="fine-print">{ui("ui.components.ProfileSaleFields.wooHelp", "Use this store’s cart page and the product or variation ID for this instrument. The link adds one item. Test it with an existing cart before sharing.")}</p> : null}
  </details>;
}
