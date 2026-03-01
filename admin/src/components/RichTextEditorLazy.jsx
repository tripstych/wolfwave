import { Suspense } from 'react';

// Loading component for RichTextEditor
function RichTextEditorLoading() {
  return (
    <div className="min-h-[200px] flex items-center justify-center border border-gray-200 rounded-lg">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
    </div>
  );
}

// Lazy-loaded RichTextEditor
const RichTextEditorLazy = (() => {
  let Component;
  let promise;
  
  return function LazyRichTextEditor(props) {
    if (!Component) {
      if (!promise) {
        promise = import('./RichTextEditor.jsx').then(module => {
          Component = module.default;
          return Component;
        });
      }
      
      throw promise;
    }
    
    return <Component {...props} />;
  };
})();

export default function RichTextEditorWrapper(props) {
  return (
    <Suspense fallback={<RichTextEditorLoading />}>
      <RichTextEditorLazy {...props} />
    </Suspense>
  );
}
