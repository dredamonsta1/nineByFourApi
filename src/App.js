const element = React.createElement(
    "h1", 
    {title: "landing"},
    "Hello"
)
// < h1 title = "landingP" > Hello </h1>
const container = document.getElementById("root")
ReactDom.render(element, container)