import React from 'react';
import Gallery from './components/Gallery.jsx';

export default function GalleryPage(props) {
  return (
    <div className="page-inner show-page">
      <Gallery {...props} />
    </div>
  );
}
