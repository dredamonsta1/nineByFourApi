import React, { useState } from 'react';
// import logo from './logo.svg';
import './App.css';
import AddToList from './components/AddToList';
import List from "./components/List"


export interface IState {
  people: {
    name: string
    stageName: string,
      url: string,
      age: number,
      home: string,
      recordLabel: string,
      numberOfAlbums: number,
      albumName: string,
      // releaseDate: Date,
      // diamondCert: boolean,
      note?: string
  }[]
}



function App() {

  const drake = <img src="../public/drake.jpg" alt="" />

  const [people, setPeople] = useState<IState["people"]>([
    {
      name: "Aubrey Graham",
      stageName: "Drake",
      url: `${drake}`,
      age: 35,
      home: "Toronto",
      recordLabel: "OVO Sound",
      numberOfAlbums: 12,
      albumName: "CLB",
      // releaseDate: "2021-11-3",
      // diamondCert: true,
      note: "6 God tings you done know"

    }])



  return (
    <div className="App">
      <h1>Nine By Four Api</h1>
      <h1>People Invited to my Party</h1>
      <List people={people}/>
      <AddToList people={people} setPeople={setPeople}/>
    </div>
  );
}

export default App;
