import AceEditor from "react-ace";
import ace from "ace-builds";

import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-html";
import "ace-builds/src-noconflict/mode-css";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/theme-monokai";
import "ace-builds/src-noconflict/theme-github";
import "ace-builds/src-noconflict/ext-language_tools";

// Import workers for production/dynamic loading fix
import workerJavascriptUrl from "ace-builds/src-noconflict/worker-javascript?url";
import workerHtmlUrl from "ace-builds/src-noconflict/worker-html?url";
import workerCssUrl from "ace-builds/src-noconflict/worker-css?url";
import workerJsonUrl from "ace-builds/src-noconflict/worker-json?url";

ace.config.setModuleUrl("ace/mode/javascript_worker", workerJavascriptUrl);
ace.config.setModuleUrl("ace/mode/html_worker", workerHtmlUrl);
ace.config.setModuleUrl("ace/mode/css_worker", workerCssUrl);
ace.config.setModuleUrl("ace/mode/json_worker", workerJsonUrl);

export default function CodeEditor({ 
  value, 
  onChange, 
  mode = "javascript", 
  theme = "monokai", 
  height = null,
  readOnly = false
}) {
  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden flex flex-col" style={{ height: height || '100%' }}>
       <AceEditor
        mode={mode}
        theme={theme}
        onChange={onChange}
        value={value}
        name="code-editor"
        editorProps={{ $blockScrolling: true }}
        setOptions={{
          enableBasicAutocompletion: true,
          enableLiveAutocompletion: true,
          enableSnippets: true,
          showLineNumbers: true,
          tabSize: 2,
          useWorker: true,
        }}
        width="100%"
        fontSize={14}
        showPrintMargin={false}
        showGutter={true}
        highlightActiveLine={true}
        readOnly={readOnly}
      />
    </div>
  );
}
