"use client";

import type { ReactNode } from "react";
import Link from "./CheckoutAwareLink";
import { ArrowRight, ArrowUpRight, Camera, Layers3, QrCode, Store } from "lucide-react";
import { CollectibleRecordCard } from "./CollectibleRecordCard";
import { CompactQr } from "./CompactQr";
import { FallbackImage } from "./FallbackImage";
import { useUiText } from "./UiTextProvider";
import { buildCollectionDirectory, collectionRoleLabel, type DirectoryCollection } from "../lib/collection-directory";
import { discoveryCategories, discoveryCategoryHref, matchesDiscoveryCategory } from "../lib/discovery-catalog";
import { getProfilePhotoUrls } from "../lib/instrument-profile-contract";
import { resolveCollectibleCard } from "../lib/collectible-card";
import { isEligiblePublicProfile } from "../lib/public-profile-eligibility";
import { selectHomeFeaturedProfile } from "../lib/home-featured-profile";
import { publicMediaVariantUrl } from "../lib/public-media-variant";
import { defaultContentValues, getContentValue } from "../lib/content-registry";
import { homeSignupSections } from "../lib/home-signup-layout";
import type { DemoInstrument } from "../lib/local-demo";
import type { EditableSiteSettings } from "../lib/site-settings";
import styles from "./HomeDiscovery.module.css";

type Props = {
  records: DemoInstrument[]; settings: EditableSiteSettings;
  hero: { eyebrow: string; headline: string; body: string; primaryCta: string; secondaryCta: string };
  pending: boolean; failed: boolean; onRetry: () => void;
};

/** A compact entry to an existing public Profile, with its owner's photograph intact. */
function DiscoveryInstrument({ record, lead = false }: { record: DemoInstrument; lead?: boolean }) {
  const card = resolveCollectibleCard(record);
  return <Link href={"/i/" + encodeURIComponent(record.qrCode)} className={styles.instrumentTile} data-lead={lead || undefined}>
    <div className={styles.instrumentPhoto}>
      <FallbackImage src={publicMediaVariantUrl(card.images[0], lead ? 1200 : 640)} alt={card.title}
        width={lead ? 1200 : 640} height={lead ? 960 : 480} loading={lead ? "eager" : "lazy"}
        decoding="async" referrerPolicy="no-referrer"
        fallback={<span className={styles.imageFallback}>Photo unavailable</span>} />
      <span className={styles.photoCount}><Camera size={12} aria-hidden="true" />{card.images.length}</span>
    </div>
    <div className={styles.instrumentCaption}>
      <div className={styles.instrumentMeta}><span>{card.typeLabel}</span>{record.year ? <span>{record.year}</span> : null}</div>
      <h2>{card.title}<ArrowUpRight size={20} aria-hidden="true" /></h2>
      <span className={styles.recordCode}>{card.code}</span>
    </div>
  </Link>;
}

export function HomeDiscovery({ records, settings, hero, pending, failed, onRetry }: Props) {
  const ui = useUiText("components.HomeDiscovery");
  const text = (key: string) => getContentValue(settings.content, key);
  const changed = (key: string) => text(key) !== defaultContentValues[key];
  const publicRecords = records.filter(record => record.visibility === "public" && !record.collectionRemovedAt && isEligiblePublicProfile(record));
  const featured = publicRecords.filter(record => record.safetyStatus !== "lost" && record.safetyStatus !== "stolen" && getProfilePhotoUrls(record).length);
  const first = selectHomeFeaturedProfile(featured);
  const seen = new Set<string>();
  const unique = [first, ...featured].filter((record): record is DemoInstrument => {
    if (!record || seen.has(record.qrCode)) return false;
    seen.add(record.qrCode); return true;
  });
  const categories = discoveryCategories(publicRecords);
  const archiveVisible = homeSignupSections(settings.composition.home.sections).some(section => section.id === "archive" && section.visible);
  // Directory names and attribution come only from the permitted public projection.
  const collections = buildCollectionDirectory(publicRecords);
  const businesses = collections.filter(collection => ["builder", "shop", "luthier"].includes(collection.accountType));
  const personalCollections = collections.filter(collection => !["builder", "shop", "luthier"].includes(collection.accountType));
  const brands = [...new Set(publicRecords.map(record => record.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const second = unique.find(record => record !== first && !matchesDiscoveryCategory(record, "guitars")) || unique[1];
  const third = unique.find(record => record !== first && record !== second);
  const photosFor = (collection?: DirectoryCollection) => {
    const matches = collection ? publicRecords.filter(record => record.publicCollection?.handle === collection.handle) : unique;
    const covers = matches.map(record => getProfilePhotoUrls(record)[0]).filter(Boolean);
    return [...new Set([...covers, ...matches.flatMap(record => getProfilePhotoUrls(record))])].slice(0, 3);
  };
  const countLabel = (count: number) => count === 1
    ? ui("ui.components.HomeDiscovery.publicCountSingular", "{{count}} public Profile", { count })
    : ui("ui.components.HomeDiscovery.publicCount", "{{count}} public Profiles", { count });
  const countCopy = (count: number) => failed ? ui("ui.components.HomeDiscovery.feedUnavailable", "Browse the archive")
    : pending ? ui("ui.components.HomeDiscovery.feedLoading", "Explore Profiles") : countLabel(count);
  const sectionTitle = (id: string, name: string, href: string, label: string, note?: string) => <header className={styles.sectionHeading}>
    <div>{note ? <span className={styles.eyebrow}>{note}</span> : null}<h2 id={id}>{name}</h2></div>
    <Link href={href}>{label}<ArrowUpRight size={17} aria-hidden="true" /></Link>
  </header>;
  const collage = (photos: string[]) => <div className={styles.collage} data-photos={photos.length}>
    {photos.length ? photos.map((photo, index) => <FallbackImage key={photo} src={publicMediaVariantUrl(photo, 640)} alt=""
      width={640} height={480} loading="lazy" decoding="async" referrerPolicy="no-referrer" data-first={index === 0 || undefined}
      fallback={<span className={styles.imageFallback}><Layers3 size={24} aria-hidden="true" /></span>} />)
      : <span className={styles.imageFallback}><Layers3 size={32} aria-hidden="true" /></span>}
  </div>;
  const collectionTile = (collection?: DirectoryCollection) => <Link className={styles.collectionTile}
    href={collection ? "/collections/" + encodeURIComponent(collection.handle) : "/catalog"}>
    {collage(photosFor(collection))}
    <div className={styles.collectionCaption}>
      <span className={styles.eyebrow}>{collection ? collectionRoleLabel(collection.accountType) : ui("ui.components.HomeDiscovery.publicSelection", "From the public catalog")}</span>
      <h3>{collection ? collection.name : ui("ui.components.HomeDiscovery.lookCloser", "Get to know the instruments.")}<ArrowUpRight size={19} aria-hidden="true" /></h3>
      {collection ? <span>{countCopy(collection.count)}</span> : null}
    </div>
  </Link>;
  const feedStatus = failed ? <div role="status" className={styles.feedStatus}>{ui("ui.components.HomeDiscovery.failed", "Public Profiles could not be refreshed.")} <button type="button" onClick={onRetry}>{ui("ui.components.HomeDiscovery.retry", "Retry")}</button></div>
    : pending && !unique.length ? <p role="status" aria-busy="true" className={styles.feedStatus}>{ui("ui.components.HomeDiscovery.loading", "Loading public Profiles...")}</p> : null;
  // Keep saved editorial overrides reachable, without repeating the default explainer sections.
  const extraKeys = [
    "home.archive.eyebrow", "home.archive.heading", "home.archive.body",
    "home.steps.headline", "home.steps.1.title", "home.steps.1.body", "home.steps.2.title", "home.steps.2.body", "home.steps.3.title", "home.steps.3.body",
    "home.audience.headline", "home.audience.players.title", "home.audience.players.body", "home.audience.shops.title", "home.audience.shops.body", "home.audience.builders.title", "home.audience.builders.body",
    "home.product.feature1", "home.product.feature2", "home.product.feature3"
  ].filter(key => changed(key) && text(key).trim());
  const managedHeroExtras = <>
    {changed("home.hero.accessNote") && text("home.hero.accessNote").trim() ? <Link className={styles.captionNote} href="/billing">{text("home.hero.accessNote")}</Link> : null}
    {changed("home.hero.viewProfile") && text("home.hero.viewProfile").trim() ? first ? <Link href={"/i/" + encodeURIComponent(first.qrCode)}>{text("home.hero.viewProfile")}<ArrowRight size={16} aria-hidden="true" /></Link> : <span className={styles.captionNote}>{text("home.hero.viewProfile")}</span> : null}
  </>;
  const sections: Record<string, ReactNode> = {
    hero: <section className={styles.opening} aria-labelledby="home-title">
      <nav className={styles.categoryNav} aria-label={ui("ui.components.HomeDiscovery.categories", "Explore instrument categories")}>
        {categories.map(category => <Link href={discoveryCategoryHref(category.id)} key={category.id}>{category.label}<ArrowUpRight size={14} aria-hidden="true" /></Link>)}
        <Link href="/collections">{ui("ui.components.HomeDiscovery.collections", "Collections")}</Link>
        <Link href={archiveVisible ? "#home-brands" : "/catalog"}>{ui("ui.components.HomeDiscovery.brands", "Browse by brand")}</Link>
        <Link href={archiveVisible ? "#business-archives" : "/collections"}>{ui("ui.components.HomeDiscovery.businessNav", "Builders & shops")}</Link>
      </nav>
      <header className={styles.discoveryHeading}>
        <div>{hero.eyebrow ? <span className={styles.eyebrow}>{hero.eyebrow}</span> : null}
          <h1 id="home-title">{changed("home.hero.headline") ? hero.headline : ui("ui.components.HomeDiscovery.collectorHeadline", "Instruments worth knowing.")}</h1>
        </div>
        <Link href="/catalog">{hero.secondaryCta}<ArrowUpRight size={18} aria-hidden="true" /></Link>
      </header>
      {feedStatus}
      {first ? <div className={styles.editorialGrid} data-count={Math.min(unique.length, 3)}>
        <div className={styles.leadInstrument}><DiscoveryInstrument record={first} lead /></div>
        {second ? <div className={styles.secondInstrument}><DiscoveryInstrument record={second} /></div> : null}
        <div className={styles.introduction}>
          <span className={styles.editionMark} aria-hidden="true">Q / G</span>
          <h2>{ui("ui.components.HomeDiscovery.collectionPointOfView", "A collection is a point of view.")}</h2>
          {hero.body ? <p>{hero.body}</p> : null}
          <Link href="/create">{hero.primaryCta}<ArrowUpRight size={18} aria-hidden="true" /></Link>
          {managedHeroExtras}
        </div>
        {third ? <div className={styles.thirdInstrument}><DiscoveryInstrument record={third} /></div> : null}
        <div className={styles.heroCollection}>{collectionTile(personalCollections[0])}</div>
      </div> : <div className={styles.noInstruments}>
        <h2>{ui("ui.components.HomeDiscovery.publicArchive", "The public instrument catalog")}</h2>
        {hero.body ? <p>{hero.body}</p> : null}
        <Link className={styles.createAction} href="/create">{hero.primaryCta}<ArrowUpRight size={18} aria-hidden="true" /></Link>{managedHeroExtras}
        <p>{failed ? ui("ui.components.HomeDiscovery.failedCategory", "Public Profiles could not be refreshed.") : pending ? ui("ui.components.HomeDiscovery.loadingCategory", "Checking public Profiles…") : ui("ui.components.HomeDiscovery.noPublicYet", "No public Profiles yet")}</p>
        <Link href="/catalog">{hero.secondaryCta}<ArrowUpRight size={18} aria-hidden="true" /></Link>
      </div>}
    </section>,
    archive: <>
      {categories.map((category, index) => {
        const matching = unique.filter(record => matchesDiscoveryCategory(record, category.id));
        const categoryRecords = publicRecords.filter(record => matchesDiscoveryCategory(record, category.id));
        return <section className={styles.categorySection} id={"discover-" + category.id.replace(/[^a-z0-9-]/gi, "-")} aria-labelledby={"home-category-" + index} key={category.id}>
          {sectionTitle("home-category-" + index, category.label, discoveryCategoryHref(category.id), ui("ui.components.HomeDiscovery.viewAll", "View all"), countCopy(categoryRecords.length))}
          {matching.length ? <div className={styles.categoryMosaic} data-count={Math.min(matching.length, 4)} data-category={category.id}>
            {matching.slice(0, 4).map(record => <CollectibleRecordCard key={record.qrCode} record={record} variant="latest" homeFeatured />)}
          </div> : <div className={styles.emptyCategory}>
            <span>{failed ? ui("ui.components.HomeDiscovery.failedCategory", "Public Profiles could not be refreshed.") : pending ? ui("ui.components.HomeDiscovery.loadingCategory", "Checking public Profiles…") : categoryRecords.length ? ui("ui.components.HomeDiscovery.moreInCatalog", "Explore this category in the Catalog.") : ui("ui.components.HomeDiscovery.emptyCategory", "No public Profiles in this category yet.")}</span>
            <Link href={discoveryCategoryHref(category.id)}>{ui("ui.components.HomeDiscovery.browseCategory", "Browse category")}<ArrowUpRight size={18} aria-hidden="true" /></Link>
          </div>}
        </section>;
      })}
      <section className={styles.brandsSection} id="home-brands" aria-labelledby="home-brand-title">
        {sectionTitle("home-brand-title", ui("ui.components.HomeDiscovery.brands", "Browse by brand"), "/catalog", ui("ui.components.HomeDiscovery.allInstruments", "All instruments"))}
        {brands.length ? <div className={styles.brandGrid}>{brands.slice(0, 8).map(brand => {
          const brandRecords = publicRecords.filter(record => record.brand === brand), photoRecord = unique.find(record => record.brand === brand);
          const photo = photoRecord && getProfilePhotoUrls(photoRecord)[0];
          return <Link key={brand} href={"/catalog?" + new URLSearchParams({ brand }).toString()} className={styles.brandTile}>
            <div className={styles.brandPhoto}>{photo ? <FallbackImage src={publicMediaVariantUrl(photo, 400)} alt="" width={320} height={240} loading="lazy" decoding="async" referrerPolicy="no-referrer" fallback={<span>{brand}</span>} /> : <span>{brand.slice(0, 1)}</span>}</div>
            <div><h3>{brand}</h3><span>{countCopy(brandRecords.length)}</span></div><ArrowUpRight size={18} aria-hidden="true" />
          </Link>;
        })}</div> : <p className={styles.compactEmpty}>{ui("ui.components.HomeDiscovery.noBrands", "Brands appear here as public Profiles are added.")}</p>}
        <p className={styles.captionNote}>{ui("ui.components.HomeDiscovery.brandNote", "Names from the public collection of instruments.")}</p>
      </section>
      <section className={styles.collectionsSection} aria-labelledby="home-collections">
        {sectionTitle("home-collections", ui("ui.components.HomeDiscovery.inside", "Every collection has a point of view."), "/collections", ui("ui.components.HomeDiscovery.seeCollections", "Explore collections"))}
        {personalCollections.length ? <div className={styles.collectionGrid}>{personalCollections.slice(0, 3).map(collection => <div key={collection.handle}>{collectionTile(collection)}</div>)}</div>
          : <div className={styles.collectionFallback}>{collectionTile()}<div><h3>{ui("ui.components.HomeDiscovery.yourCollection", "Make a collection that’s yours.")}</h3><p>{failed ? ui("ui.components.HomeDiscovery.personalCollectionsFailed", "Public personal collections could not be refreshed.") : pending ? ui("ui.components.HomeDiscovery.personalCollectionsPending", "Checking public personal collections…") : ui("ui.components.HomeDiscovery.noPersonalCollections", "No public personal collections are listed yet. Explore individual Profiles, or choose the instruments you want to share together.")}</p><Link href="/account?section=collection">{ui("ui.components.HomeDiscovery.collectionSettings", "Collection settings")}<ArrowUpRight size={18} aria-hidden="true" /></Link></div></div>}
      </section>
      <section className={styles.businessSection} id="business-archives" aria-labelledby="home-businesses">
        {sectionTitle("home-businesses", ui("ui.components.HomeDiscovery.businessHeading", "Builders, shops & luthiers."), "/collections", ui("ui.components.HomeDiscovery.browsePeople", "Explore public archives"))}
        {businesses.length ? <div className={styles.businessGrid}>{businesses.slice(0, 3).map(business => <Link href={"/collections/" + encodeURIComponent(business.handle)} className={styles.businessCard} key={business.handle}>
          {collage(photosFor(business))}<div><span className={styles.eyebrow}>{collectionRoleLabel(business.accountType)}</span><h3>{business.name}<ArrowUpRight size={19} aria-hidden="true" /></h3><span>{countCopy(business.count)}</span></div>
        </Link>)}</div> : <div className={styles.compactEmpty}><Store size={22} aria-hidden="true" /><p>{failed ? ui("ui.components.HomeDiscovery.businessUnavailable", "Public business archives could not be refreshed.") : pending ? ui("ui.components.HomeDiscovery.businessLoading", "Checking public business archives...") : ui("ui.components.HomeDiscovery.noBusinessesCompact", "No public business archives are listed yet.")}</p><Link href="/account?section=collection">{ui("ui.components.HomeDiscovery.setUpArchive", "Set up your public archive")}<ArrowUpRight size={18} aria-hidden="true" /></Link></div>}
      </section>
      <section className={styles.qrStrip} aria-labelledby="home-qr">
        <div className={styles.qrMark}>{first ? <CompactQr code={first.qrCode} label={first.name || first.model || first.qrCode} /> : <QrCode size={64} aria-hidden="true" />}</div>
        <div>{text("home.product.eyebrow") ? <span className={styles.eyebrow}>{text("home.product.eyebrow")}</span> : null}<h2 id="home-qr">{text("home.product.headline")}</h2>{text("home.product.body") ? <p>{text("home.product.body")}</p> : null}{text("home.product.privacy") ? <p className={styles.captionNote}>{text("home.product.privacy")}</p> : null}</div>
        <Link href={first ? "/i/" + encodeURIComponent(first.qrCode) : "/how-it-works"}>{first ? text("home.product.cta") : text("home.steps.cta")}<ArrowRight size={18} aria-hidden="true" /></Link>
      </section>
      {extraKeys.length ? <details className={styles.editorialNotes}><summary>{ui("ui.components.HomeDiscovery.moreAbout", "More about QRguitar")}</summary><div>{extraKeys.map(key => <p key={key}>{text(key)}</p>)}</div></details> : null}
    </>,
    roles: <section className={styles.signup} id="audiences" aria-labelledby="home-signup-title"><div>
      {text("home.signup.eyebrow") ? <span className={styles.eyebrow}>{text("home.signup.eyebrow")}</span> : null}<h2 id="home-signup-title">{text("home.signup.headline")}</h2>
      {text("home.signup.body") ? <p>{text("home.signup.body")}</p> : null}
    </div><div><Link className={styles.createAction} href="/login?mode=register&next=%2Fcreate">{text("home.signup.cta")}<ArrowUpRight size={18} aria-hidden="true" /></Link>{text("home.signup.note") ? <p className={styles.captionNote}>{text("home.signup.note")}</p> : null}</div></section>
  };
  return <div className={styles.discovery}>{homeSignupSections(settings.composition.home.sections).filter(section => section.visible).map(section => <div key={section.id}>{sections[section.id] || null}</div>)}</div>;
}

