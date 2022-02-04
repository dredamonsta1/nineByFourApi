var http = require('http')

var fs= require('fs')

http
    .createServer(function (req, res) {
        // const text = fs.readFileSync('./content/first.txt', 'utf8')
        // res.end(text)
        const fileStream = fs.createReadStream('./content/first.txt', 'utf8');
        fileStream.on('open', ()=>{
            fileStream.pipe(res)

        })
        fileStream.on('error', (err)=> {
            res.end(err)
        })

    })
    .listen(5000)











// const EventEmitter = require ('events');

// const customEmitter = new EventEmitter()

// customEmitter.on('response', (name, id) => {
//     console.log(`data recieved user ${name} with id:${id}`)
// })

// customEmitter.on('response', () => {
//     console.log(`run off on the plug`)
// })

// customEmitter.emit('response', 'john', 34)







// const { createReadStream } = require('fs')

// const stream = createReadStream('./content/first.txt', {highWaterMark:90000, encoding:'utf8'})

// stream.on('data', (result) => {
//     console.log(result)
// })

// stream.on('error', (err) => console.log(err))