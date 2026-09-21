import Figure from "./Figure";
import ContentImage from "./ContentImage";
import Gallery from "./Gallery";
import GalleryItem from "./GalleryItem";
import Callout from "./Callout";

export const mdxComponents = {
  img: ContentImage, // upgrade bare markdown images
  Figure,
  Gallery,
  // Registered so <GalleryItem> resolves inside an authored <Gallery>. Every entry
  // here must stay a pure presentational function: MdxServer's guard invokes these
  // directly, so a hook or a "use client" component would break the render path.
  GalleryItem,
  Callout,
};
