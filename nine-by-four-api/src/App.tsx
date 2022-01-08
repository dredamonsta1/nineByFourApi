import React, { useState } from 'react';
// import logo from './logo.svg';
import './App.css';
import List from "./components/List"


interface IState {
  people: {
    name: string
    stageName: string,
      url: string,
      age: number,
      home: string,
      recordLabel: string,
      numberOfAlbums: number,
      albumName: string,
      releaseDate: Date,
      diamondCert: boolean,
      notes?: string
  }[]
}



function App() {

  const [people, setPeople] = useState<IState["people"]>([])



  return (
    <div className="App">
      <h1>Nine By Four Api</h1>
      <h1>People Invited to my Party</h1>
      <List people={people}/>
    </div>
  );
}

export default App;
