// ***built in modules***
// os
// path
// fs
// http

const sayHi  = require("./fiveUtils");
const names = require('./fourNames');
const data = require('./sixAltFlavor');
require('./mindBomb')

// console.log(names)
// console.log(data)
// console.log(sayHi)
sayHi("susan")
sayHi(names.john)
sayHi(names.peter)



const os = require('os')

//info about current user

const user = os.userInfo()
console.log(user)

//system uptime  in seconds

console.log(user)

console.log(`system uptime is ${os.uptime()} seconds`)

const currentOS = {
    name:os.type(),
    release:os.release(),
    totalMem:os.totalmem(),
    freeMem:os.freemem(),
}
console.log(currentOS)



// const { readFile, writeFile } = require('fs');

// readFile('./content/first.txt', 'utf8', (err,result) => {
//     if (err) {
//         console.log(err)
//         return
//     }

//     const first = result;
//     readFile('./content/second.txt', 'utf8', (err, result) => {
//         if (err) {
//             console.log(err)
//             return
//         }
//         const second = result
//         writeFile(
//             './content/result-async.txt', 
//             `here is the result : ${first}, ${second}`,
//             { flag: 'a' }, (err,result) => {
//                 if(err) {
//                     console.log(err);
//                     return;
//                 }
//                 console.log(result)

//             })

//     })
// })
