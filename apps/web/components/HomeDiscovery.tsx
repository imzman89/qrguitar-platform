"use client";

import Link from "./CheckoutAwareLink";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, Layers3, QrCode, ScanLine, Store, AudioLines } from "lucide-react";
import { CollectibleRecordCard } from "./CollectibleRecordCard";
import { HomeAudiences } from "./HomeProductStory";
import { CompactQr } from "./CompactQr";
import { FallbackImage } from "./FallbackImage";
import { useUiText } from "./UiTextProvider";
import { buildCollectionDirectory, collectionRoleLabel } from "../lib/collection-directory";
import { discoveryCategories, discoveryCategoryHref, matchesDiscoveryCategory } from "../lib/discovery-catalog";
import { getProfilePhotoUrls } from "../lib/instrument-profile-contract";
import { isEligiblePublicProfile } from "../lib/public-profile-eligibility";
import { selectHomeFeaturedProfile } from "../lib/home-featured-profile";
import { publicMediaVariantUrl } from "../lib/public-media-variant";
import { getContentValue } from "../lib/content-registry";
import { homeSignupSections } from "../lib/home-signup-layout";
import type { DemoInstrument } from "../lib/local-demo";
import type { EditableSiteSettings } from "../lib/site-settings";
import styles from "./HomeDiscovery.module.css";

type Props = {
  records: DemoInstrument[]; settings: EditableSiteSettings;
  hero: { eyebrow: string; headline: string; body: string; primaryCta: string; secondaryCta: string };
  pending: boolean; failed: boolean; onRetry: () => void;
};

export function HomeDiscovery({ records, settings, hero, pending, failed, onRetry }: Props) {
  const ui = useUiText("components.HomeDiscovery");
  const text = (key: string) => getContentValue(settings.content, key);
  const publicRecords = records.filter(record => record.visibility === "public" && !record.collectionRemovedAt && isEligiblePublicProfile(record));
  const featured = publicRecords.filter(record => record.safetyStatus !== "lost" && record.safetyStatus !== "stolen" && getProfilePhotoUrls(record).length);
  const first = selectHomeFeaturedProfile(featured);
  const seen = new Set<string>();
  const unique = [first, ...featured].filter((record): record is DemoInstrument => {
    if (!record || seen.has(record.qrCode)) return false;
    seen.add(record.qrCode); return true;
  });
  // The directory receives the full permitted feed, never just the photo/hero subset.
  const collections = buildCollectionDirectory(publicRecords);
  const categories = discoveryCategories(publicRecords);
  const brands = [...new Set(publicRecords.map(record => record.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const [requestedCategory, setRequestedCategory] = useState("guitars");
  const activeCategory = categories.some(category => category.id === requestedCategory) ? requestedCategory : categories[0]?.id;
  const businessHref = homeSignupSections(settings.composition.home.sections).some(section => section.id === "archive" && section.visible) ? "#business-archives" : "/collections";
  const businesses = collections.filter(collection => ["builder", "shop", "luthier"].includes(collection.accountType));
  const individualCollections = collections.filter(collection => !["builder", "shop", "luthier"].includes(collection.accountType));
  const coverFor = (id: string) => unique.find(record => matchesDiscoveryCategory(record, id));
  const archivePhotos = unique.filter(record => record !== coverFor("guitars") && record !== coverFor("amps")).slice(0, 2);
  const openingCodes = new Set([coverFor("guitars"), coverFor("amps"), ...archivePhotos].filter((record): record is DemoInstrument => Boolean(record)).map(record => record.qrCode));
  const categoryTile = (id: string, className: string) => {
    const category = categories.find(item => item.id === id);
    if (!category) return null;
    const cover = coverFor(id), photo = cover && getProfilePhotoUrls(cover)[0];
    const count = publicRecords.filter(record => matchesDiscoveryCategory(record, id)).length;
    return <Link className={styles.categoryTile + " " + className} href={discoveryCategoryHref(id)}>
      <div className={styles.tilePhoto}>{photo ? <FallbackImage src={publicMediaVariantUrl(photo, 640)} alt="" width={640} height={640} loading={id === "guitars" ? "eager" : "lazy"} fetchPriority={id === "guitars" ? "high" : "auto"} decoding="async" referrerPolicy="no-referrer" fallback={<AudioLines size={40} aria-hidden="true" />} /> : <AudioLines size={40} aria-hidden="true" />}</div>
      <div className={styles.tileCaption}><div><h2>{category.label}</h2><span>{failed ? ui("ui.components.HomeDiscovery.feedUnavailable", "Browse the archive") : pending ? ui("ui.components.HomeDiscovery.feedLoading", "Explore Profiles") : count ? ui("ui.components.HomeDiscovery.publicCount", "{{count}} public Profiles", { count }) : ui("ui.components.HomeDiscovery.noPublicYet", "No public Profiles yet")}</span></div><ArrowUpRight size={22} aria-hidden="true" /></div>
    </Link>;
  };
  const onCategoryKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "ArrowRight" ? (index + 1) % categories.length : event.key === "ArrowLeft" ? (index - 1 + categories.length) % categories.length : event.key === "Home" ? 0 : event.key === "End" ? categories.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); setRequestedCategory(categories[next].id);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  const sectionTitle = (id: string, name: string, href: string, label: string) => <header className={styles.sectionHeading}>
    <h2 id={id}>{name}</h2><Link href={href}>{label}<ArrowUpRight size={17} aria-hidden="true" /></Link>
  </header>;
  const managedIntroduction = (<div className={styles.managedIntroduction}><div>{hero.eyebrow ? <p className={styles.eyebrow}>{hero.eyebrow}</p> : null}{hero.body ? <p>{hero.body}</p> : null}</div><div className={styles.introActions}><Link className={styles.createAction} href="/create">{hero.primaryCta}<ArrowUpRight size={18} aria-hidden="true" /></Link><Link className={styles.secondaryAction} href={first ? "/i/" + encodeURIComponent(first.qrCode) : "/catalog"}>{first ? text("home.hero.viewProfile") : hero.secondaryCta}<ArrowRight size={17} aria-hidden="true" /></Link>{text("home.hero.accessNote") ? <Link className={styles.accessNote} href="/billing">{text("home.hero.accessNote")}</Link> : null}</div></div>);
  const sections = {
    hero: <section className={styles.opening} aria-labelledby="home-title">
      <nav className={styles.categoryNav} aria-label={ui("ui.components.HomeDiscovery.categories", "Explore instrument categories")}>
        <Link className={styles.allCategory} href="/catalog">{ui("ui.components.HomeDiscovery.discover", "Discover")}<ArrowUpRight size={16} aria-hidden="true" /></Link>
        {categories.map(category => <Link href={discoveryCategoryHref(category.id)} key={category.id}>{category.label}</Link>)}
        <Link href={businessHref}>{ui("ui.components.HomeDiscovery.businessNav", "Builders & shops")}</Link>
        <Link href="/collections">{ui("ui.components.HomeDiscovery.collections", "Collections")}</Link>
      </nav>
      <header className={styles.discoveryHeading}><h1 id="home-title">{ui("ui.components.HomeDiscovery.discoverHeadline", "Every instrument has a story.")}</h1><Link href="/catalog">{ui("ui.components.HomeDiscovery.exploreArchive", "Explore the archive")}<ArrowUpRight size={17} aria-hidden="true" /></Link></header>
      <div className={styles.discoveryWall}>
        {categoryTile("guitars", styles.wallGuitars)}
        {categoryTile("amps", styles.wallAmps)}
        <Link className={styles.archiveTile} href="/catalog">
          <div className={styles.archivePhotos}>{archivePhotos.length ? archivePhotos.map(record => <FallbackImage key={record.qrCode} src={publicMediaVariantUrl(getProfilePhotoUrls(record)[0], 640)} alt="" width={640} height={640} loading="lazy" decoding="async" referrerPolicy="no-referrer" fallback={<Layers3 size={28} aria-hidden="true" />} />) : <Layers3 size={40} aria-hidden="true" />}</div>
          <div className={styles.tileCaption}><div><h2>{ui("ui.components.HomeDiscovery.oneOfAKind", "One of a kind.")}</h2><span>{ui("ui.components.HomeDiscovery.lookCloser", "Get to know the instruments.")}</span></div><ArrowUpRight size={22} aria-hidden="true" /></div>
        </Link>
        <Link className={styles.businessPortal} href={businessHref}><Store size={26} aria-hidden="true" /><div><span>{ui("ui.components.HomeDiscovery.peopleBehind", "The people behind the instruments")}</span><h2>{ui("ui.components.HomeDiscovery.businessHeading", "Builders, shops & luthiers.")}</h2></div><ArrowUpRight size={24} aria-hidden="true" /></Link>
        {categoryTile("pedals", styles.wallPedals)}
      </div>
      {failed ? <div role="status" className={styles.feedStatus}>{ui("ui.components.HomeDiscovery.failed", "Public Profiles could not be refreshed.")} <button type="button" onClick={onRetry}>{ui("ui.components.HomeDiscovery.retry", "Retry")}</button></div>
        : pending && !unique.length ? <p role="status" aria-busy="true" className={styles.feedStatus}>{ui("ui.components.HomeDiscovery.loading", "Loading public Profiles...")}</p> : null}
      <div className={styles.archiveNote}><p>{ui("ui.components.HomeDiscovery.archiveIntro", "Discover the photographs, identities and stories of real instruments. An archive built by players, collectors and the people who make and care for them.")}</p><Link href="/create">{hero.primaryCta}<ArrowUpRight size={17} aria-hidden="true" /></Link></div>
      {hero.headline.trim() ? <details className={styles.archiveFoundation}><summary>{hero.headline}</summary>{managedIntroduction}</details> : managedIntroduction}
    </section>,
    archive: <>
      <section className={styles.businessSection} id="business-archives" aria-labelledby="home-businesses">
        {sectionTitle("home-businesses", ui("ui.components.HomeDiscovery.businessHeading", "Builders, shops & luthiers."), "/collections", ui("ui.components.HomeDiscovery.browsePeople", "Explore public archives"))}
        {businesses.length ? <div className={styles.businessGrid}>{businesses.map(business => <Link href={"/collections/" + encodeURIComponent(business.handle)} className={styles.businessCard} key={business.handle}>
          {business.image ? <FallbackImage src={publicMediaVariantUrl(business.image, 640)} alt="" width={640} height={480} loading="lazy" decoding="async" referrerPolicy="no-referrer" fallback={<Store size={32} aria-hidden="true" />} /> : <Store size={32} aria-hidden="true" />}
          <div><span>{collectionRoleLabel(business.accountType)}</span><h3>{business.name}</h3><p>{ui("ui.components.HomeDiscovery.publicCount", "{{count}} public Profiles", { count: business.count })}</p></div><ArrowUpRight size={22} aria-hidden="true" />
        </Link>)}</div> : <div className={styles.businessInvitation}><Store size={30} aria-hidden="true" /><div><h3>{ui("ui.components.HomeDiscovery.yourWork", "Give your work a place in the archive.")}</h3><p>{failed ? ui("ui.components.HomeDiscovery.businessUnavailable", "Public business archives could not be refreshed.") : pending ? ui("ui.components.HomeDiscovery.businessLoading", "Checking public business archives...") : ui("ui.components.HomeDiscovery.noBusinesses", "No public business archives are listed here yet. Builders, shops and luthiers can create a public identity and choose which instrument Profiles to share.")}</p></div><Link href="/account?section=collection">{ui("ui.components.HomeDiscovery.setUpArchive", "Set up your public archive")}<ArrowUpRight size={18} aria-hidden="true" /></Link></div>}
      </section>
      <section className={styles.brandsSection} aria-labelledby="home-brands">
        {sectionTitle("home-brands", ui("ui.components.HomeDiscovery.brands", "Browse by brand"), "/catalog", ui("ui.components.HomeDiscovery.allInstruments", "All instruments"))}
        <p>{ui("ui.components.HomeDiscovery.brandNote", "Names from the public collection of instruments.")}</p>
        {brands.length ? <div className={styles.brandGrid}>{brands.map(brand => <Link key={brand} href={"/catalog?" + new URLSearchParams({ brand }).toString()}><strong>{brand}</strong><ArrowUpRight size={16} aria-hidden="true" /></Link>)}</div> : <p>{ui("ui.components.HomeDiscovery.noBrands", "Brands appear here as public Profiles are added.")}</p>}
      </section>
      <section className={styles.instrumentDiscovery} aria-labelledby="home-instruments">
        {sectionTitle("home-instruments", ui("ui.components.HomeDiscovery.instrumentsHeading", "Take a closer look."), "/catalog", ui("ui.components.HomeDiscovery.allInstruments", "All instruments"))}
        <div className={styles.discoveryTabs} role="tablist" aria-label={ui("ui.components.HomeDiscovery.selectCategory", "Choose an instrument category")}>
          {categories.map((category, index) => <button key={category.id} id={"discovery-tab-" + index} type="button" role="tab" aria-selected={activeCategory === category.id} aria-controls={"discovery-panel-" + index} tabIndex={activeCategory === category.id ? 0 : -1} onClick={() => setRequestedCategory(category.id)} onKeyDown={event => onCategoryKey(event, index)}>{category.label}</button>)}
        </div>
      {categories.map((category, categoryIndex) => {
        const matching = unique.filter(record => matchesDiscoveryCategory(record, category.id));
        // Show different discoveries first; retain every real category and its Catalog path.
        const items = [...matching.filter(record => !openingCodes.has(record.qrCode)), ...matching.filter(record => openingCodes.has(record.qrCode))].slice(0, 3);
        const hasPublicRecords = publicRecords.some(record => matchesDiscoveryCategory(record, category.id));
        return <section className={styles.categorySection} key={category.id} role="tabpanel" id={"discovery-panel-" + categoryIndex} hidden={activeCategory !== category.id} aria-labelledby={"discovery-tab-" + categoryIndex}>
          {sectionTitle("category-" + categoryIndex, category.label, discoveryCategoryHref(category.id), ui("ui.components.HomeDiscovery.viewAll", "View all"))}
          {items.length ? <div className={styles.categoryMosaic} data-category={category.id} data-count={items.length} data-alternate={categoryIndex % 2 === 1 ? "true" : undefined}>
            {items.map(record => <CollectibleRecordCard key={record.qrCode} record={record} variant="latest" homeFeatured />)}
          </div> : <div className={styles.emptyCategory}><div><span className={styles.eyebrow}>{category.label}</span><h3>{hasPublicRecords ? ui("ui.components.HomeDiscovery.more", "More to explore.") : ui("ui.components.HomeDiscovery.room", "There’s room for your story.")}</h3><p>{failed ? ui("ui.components.HomeDiscovery.failedCategory", "Public Profiles could not be refreshed.") : pending ? ui("ui.components.HomeDiscovery.loadingCategory", "Checking public Profiles…") : hasPublicRecords ? ui("ui.components.HomeDiscovery.moreInCatalog", "Explore this category in the Catalog.") : ui("ui.components.HomeDiscovery.emptyCategory", "No public Profiles in this category yet.")}</p></div><Link href={hasPublicRecords || failed ? discoveryCategoryHref(category.id) : "/create"}>{hasPublicRecords || failed ? ui("ui.components.HomeDiscovery.browseCategory", "Browse category") : ui("ui.components.HomeDiscovery.add", "Add an instrument")}<ArrowUpRight size={18} aria-hidden="true" /></Link></div>}
        </section>;
      })}
      </section>
      <section className={styles.collectionsSection} aria-labelledby="home-collections">
        {sectionTitle("home-collections", ui("ui.components.HomeDiscovery.inside", "Every collection has a point of view."), "/collections", ui("ui.components.HomeDiscovery.seeCollections", "Explore collections"))}
        {individualCollections.length ? <div className={styles.collectionGrid}>{individualCollections.slice(0, 3).map(collection => {
          const photos = publicRecords.filter(record => record.publicCollection?.handle === collection.handle).flatMap(record => getProfilePhotoUrls(record)).filter((photo, i, all) => all.indexOf(photo) === i).slice(0, 3);
          return <Link href={"/collections/" + encodeURIComponent(collection.handle)} className={styles.collectionCard} key={collection.handle}>
            <div className={styles.collectionCollage}>{photos.length ? photos.map((photo, i) => <FallbackImage key={photo} src={publicMediaVariantUrl(photo, 640)} alt="" width={640} height={480} loading="lazy" decoding="async" referrerPolicy="no-referrer" fallback={<span className={styles.photoFallback}><Layers3 size={28} aria-hidden="true" /></span>} data-cover={i === 0 ? "true" : undefined} />) : <span className={styles.photoFallback}><Layers3 size={32} aria-hidden="true" /></span>}</div>
            <div className={styles.collectionCaption}><span>{collectionRoleLabel(collection.accountType)}</span><h3>{collection.name}</h3><p>{collection.count} {collection.count === 1 ? ui("ui.components.HomeDiscovery.profile", "public Profile") : ui("ui.components.HomeDiscovery.profiles", "public Profiles")}</p><ArrowUpRight size={20} aria-hidden="true" /></div>
          </Link>;
        })}</div> : <div className={styles.collectionInvitation}><Layers3 size={40} aria-hidden="true" /><div><h3>{ui("ui.components.HomeDiscovery.yourCollection", "Make a collection that’s yours.")}</h3><p>{ui("ui.components.HomeDiscovery.collectionPrivacy", "Keep a private archive, or choose the Profiles you want others to explore.")}</p></div><Link href="/account?section=collection">{ui("ui.components.HomeDiscovery.collectionSettings", "Collection settings")}<ArrowUpRight size={18} aria-hidden="true" /></Link></div>}
      </section>
      <header className={styles.archiveIntro}>{text("home.archive.eyebrow") ? <p className={styles.eyebrow}>{text("home.archive.eyebrow")}</p> : null}<h2>{text("home.archive.heading")}</h2>{text("home.archive.body") ? <p>{text("home.archive.body")}</p> : null}<Link href="/catalog">{text("home.archive.viewAll")}<ArrowUpRight size={17} aria-hidden="true" /></Link></header>
      <section className={styles.qrStrip} aria-labelledby="home-qr">
        <div className={styles.qrMark}>{first ? <CompactQr code={first.qrCode} label={first.name || first.model || first.qrCode} /> : <QrCode size={64} aria-hidden="true" />}</div>
        <div><span className={styles.eyebrow}>{ui("ui.components.HomeDiscovery.permanent", "A permanent connection")}</span><h2 id="home-qr">{ui("ui.components.HomeDiscovery.scan", "One scan. The instrument’s story.")}</h2><p>{ui("ui.components.HomeDiscovery.qrBody", "Photos, identity and the history its owner shares. The same Profile stays with the instrument.")}</p></div>
        <Link href={first ? "/i/" + encodeURIComponent(first.qrCode) : "/how-it-works"}>{first ? ui("ui.components.HomeDiscovery.openExample", "Open this Profile") : ui("ui.components.HomeDiscovery.how", "How it works")}<ScanLine size={20} aria-hidden="true" /></Link>
      </section>
      <section className={styles.storyGrid} aria-labelledby="home-product-title"><div>
        {text("home.product.eyebrow") ? <p className={styles.eyebrow}>{text("home.product.eyebrow")}</p> : null}
        <h2 id="home-product-title">{text("home.product.headline")}</h2>
        {text("home.product.body") ? <p>{text("home.product.body")}</p> : null}
        <ul>{[1, 2, 3].map(i => text("home.product.feature" + i) ? <li key={i}>{text("home.product.feature" + i)}</li> : null)}</ul>
        {first && text("home.product.cta") ? <Link href={"/i/" + encodeURIComponent(first.qrCode)}>{text("home.product.cta")}<ArrowRight size={17} aria-hidden="true" /></Link> : null}{text("home.product.privacy") ? <p className={styles.privacyNote}>{text("home.product.privacy")}</p> : null}
      </div><div><h2>{text("home.steps.headline")}</h2><ol>{[1, 2, 3].map(i => text("home.steps." + i + ".title") || text("home.steps." + i + ".body") ? <li key={i}><span aria-hidden="true">{"0" + i}</span><div>{text("home.steps." + i + ".title") ? <h3>{text("home.steps." + i + ".title")}</h3> : null}{text("home.steps." + i + ".body") ? <p>{text("home.steps." + i + ".body")}</p> : null}</div></li> : null)}</ol><Link href="/how-it-works">{text("home.steps.cta")}<ArrowRight size={17} aria-hidden="true" /></Link></div></section>
    </>,
    roles: <><HomeAudiences content={settings.content} /><section className={styles.signup} aria-labelledby="home-signup-title"><div>
      {text("home.signup.eyebrow") ? <p className={styles.eyebrow}>{text("home.signup.eyebrow")}</p> : null}
      <h2 id="home-signup-title">{text("home.signup.headline")}</h2>
      {text("home.signup.body") ? <p>{text("home.signup.body")}</p> : null}
    </div><div><Link className={styles.createAction} href="/login?mode=register&next=%2Fcreate">{text("home.signup.cta")}<ArrowUpRight size={18} aria-hidden="true" /></Link>{text("home.signup.note") ? <p>{text("home.signup.note")}</p> : null}</div></section></>
  };
  return <div className={styles.discovery}>{homeSignupSections(settings.composition.home.sections).filter(section => section.visible).map(section => <div key={section.id}>{sections[section.id as keyof typeof sections] || null}</div>)}</div>;
}
