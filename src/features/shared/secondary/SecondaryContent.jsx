import './styles.css';
import React from 'react';
import { useContent, asset as defaultAsset } from '../../../data.js';
import { SecondaryLoading, SecondaryLoadError } from './SecondaryLayout.jsx';

// A shared boundary keeps secondary routes on the same content contract.
export function withSecondaryData(Page, routeProps = () => ({})) {
  function SecondaryContent(props) {
    const { data, loading, error, reload } = useContent('secondary', null);
    if (!data && loading) return <SecondaryLoading />;
    if (!data && error) return <SecondaryLoadError reload={reload} />;
    if (!data) return <SecondaryLoading />;
    const resolveAsset = props.asset || defaultAsset;
    const asset = (url) => data.uiAssets?.[url] || resolveAsset(url);
    return <Page {...props} data={data} asset={asset} {...routeProps(props)} />;
  }
  SecondaryContent.displayName = `SecondaryContent(${Page.name})`;
  return SecondaryContent;
}

export function routeParts(path) {
  return (path || window.location.pathname).split('/');
}
