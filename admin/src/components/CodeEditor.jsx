import AceEditor from "react-ace";

import "ace-builds/src-noconflict/mode-javascript";
import "ace-builds/src-noconflict/mode-html";
import "ace-builds/src-noconflict/mode-css";
import "ace-builds/src-noconflict/mode-json";
import "ace-builds/src-noconflict/theme-monokai";
import "ace-builds/src-noconflict/theme-github";
import "ace-builds/src-noconflict/ext-language_tools";

export default function CodeEditor({ 
  value, 
  onChange, 
  mode = "javascript", 
  theme = "monokai", 
  height = "400px",
  readOnly = false
}) {
  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
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
          useWorker: false, // Disable web workers to avoid issues with some build setups
        }}
        width="100%"
        height={height}
        fontSize={14}
        showPrintMargin={false}
        showGutter={true}
        highlightActiveLine={true}
        readOnly={readOnly}
      />
    </div>
  );
}
