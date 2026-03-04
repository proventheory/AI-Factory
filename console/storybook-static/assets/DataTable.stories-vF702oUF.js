import{j as t}from"./jsx-runtime-BAGZC6Y7.js";import{D as y}from"./DataTable-CwwWzpAt.js";import"./iframe-CIXb5Aaj.js";import"./preload-helper-PPVm8Dsz.js";var n,d,c,i,m,l,u,p,_;const v=[{id:"run-001",name:"Deploy prod",status:"succeeded",created_at:"2024-01-15T10:00:00Z"},{id:"run-002",name:"Doc generation",status:"running",created_at:"2024-01-15T11:00:00Z"},{id:"run-003",name:"Code review",status:"failed",created_at:"2024-01-15T12:00:00Z"}],D=[{key:"id",header:"ID",render:e=>t.jsxs("span",{className:"font-mono text-caption-small",children:[e.id.slice(0,8),"…"]})},{key:"name",header:"Name"},{key:"status",header:"Status",render:e=>t.jsx("span",{className:e.status==="succeeded"?"text-green-600":e.status==="failed"?"text-red-600":"text-slate-600",children:e.status})},{key:"created_at",header:"Created",render:e=>new Date(e.created_at).toLocaleString()}],k={title:"UI/DataTable",parameters:{layout:"padded"},tags:["autodocs"]},r={render:e=>t.jsx(y,{columns:D,data:v,keyExtractor:a=>a.id,...e})},o={render:()=>t.jsx(y,{columns:D,data:[],keyExtractor:e=>e.id})},s={render:()=>t.jsx(y,{columns:D,data:Array.from({length:10},(e,a)=>({id:`run-${String(a+1).padStart(3,"0")}`,name:`Job ${a+1}`,status:a%3===0?"succeeded":a%3===1?"running":"failed",created_at:new Date(Date.now()-a*36e5).toISOString()})),keyExtractor:e=>e.id})};r.parameters={...r.parameters,docs:{...(n=r.parameters)===null||n===void 0?void 0:n.docs,source:{originalSource:`{
  render: args => <DataTable columns={columns} data={mockData} keyExtractor={row => row.id} {...args} />
}`,...(c=r.parameters)===null||c===void 0||(d=c.docs)===null||d===void 0?void 0:d.source}}};o.parameters={...o.parameters,docs:{...(i=o.parameters)===null||i===void 0?void 0:i.docs,source:{originalSource:`{
  render: () => <DataTable columns={columns} data={[]} keyExtractor={(row: MockRow) => row.id} />
}`,...(l=o.parameters)===null||l===void 0||(m=l.docs)===null||m===void 0?void 0:m.source}}};s.parameters={...s.parameters,docs:{...(u=s.parameters)===null||u===void 0?void 0:u.docs,source:{originalSource:`{
  render: () => <DataTable columns={columns} data={Array.from({
    length: 10
  }, (_, i) => ({
    id: \`run-\${String(i + 1).padStart(3, "0")}\`,
    name: \`Job \${i + 1}\`,
    status: i % 3 === 0 ? "succeeded" : i % 3 === 1 ? "running" : "failed",
    created_at: new Date(Date.now() - i * 3600000).toISOString()
  }))} keyExtractor={row => row.id} />
}`,...(_=s.parameters)===null||_===void 0||(p=_.docs)===null||p===void 0?void 0:p.source}}};const E=["Default","Empty","ManyRows"];export{r as Default,o as Empty,s as ManyRows,E as __namedExportsOrder,k as default};
