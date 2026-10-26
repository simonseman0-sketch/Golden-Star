// Runs a public English→Arabic ONNX model locally in the browser after first download.
// No Google Translate, backend translation request, or API key.
// The model outputs general Arabic, not guaranteed Iraqi dialect.
let loading;
async function getTranslator(update) {
 if(!loading) {
  loading=(async()=>{
   update('Downloading free English→Arabic model for first use. This may take several minutes…');
   const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/+esm');
   env.allowLocalModels=false;
   return pipeline('translation','Xenova/opus-mt-en-ar',{
     device:'wasm',dtype:'q8',
     progress_callback:(x)=>{
       if(x.status==='progress' && Number.isFinite(x.progress))
         update('Downloading translation model: '+Math.round(x.progress)+'%');
     }
   });
  })().catch(err=>{loading=null;throw err;});
 }
 return loading;
}
window.gsOfflineTranslate=async(text, update=()=>{})=>{
 const translator=await getTranslator(update);
 update('Translating "'+text+'"...');
 const result=await translator(text,{max_new_tokens:96});
 const output=Array.isArray(result)?result[0]:result;
 return String(output?.translation_text||output?.generated_text||'').trim();
};
