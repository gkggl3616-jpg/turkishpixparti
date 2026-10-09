export const aiProviderDefaults={OPENAI:'gpt-4.1-mini',GROQ:'openai/gpt-oss-20b',GEMINI:'gemini-3.8-flash'} as const;
export const aiProviders=[
 {id:'GEMINI',label:'Google Gemini · ücretsiz plan mevcut',keyUrl:'https://aistudio.google.com/apikey',keyLabel:'Google AI Studio’da API anahtarı oluştur'},
 {id:'GROQ',label:'Groq · ücretsiz plan mevcut',keyUrl:'https://console.groq.com/keys',keyLabel:'Groq API anahtarı oluştur'},
 {id:'OPENAI',label:'OpenAI · kendi hesabın',keyUrl:'https://platform.openai.com/api-keys',keyLabel:'OpenAI API anahtarı oluştur'}
] as const;
