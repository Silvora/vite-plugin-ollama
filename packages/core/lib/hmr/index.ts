export function viteHMR(server:any) {
    // 监听文件变化
    server.watcher.on('change', (file:any)=>onChange(file))
      
    // 监听新增文件
    server.watcher.on('add', (file:any)=>onAdd(file))
      
    // 监听删除文件
    server.watcher.on('unlink', (file:any)=>onUnlink(file))
}


export function fileHMR() {

}


function onChange (file:any) {  
    console.log('文件发生变化')
}
function onAdd (file:any) {
    console.log('新增文件')
}
function onUnlink (file:any) {  
    console.log('删除文件')
}



