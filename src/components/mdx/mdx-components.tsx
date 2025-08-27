import Figure from "./Figure";
import ContentImage from "./ContentImage";
import Gallery from "./Gallery";

export const mdxComponents = {
  img: ContentImage, // upgrade bare markdown images
  Figure,
  Gallery,
};
