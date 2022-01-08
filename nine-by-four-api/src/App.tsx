import React, { useState } from 'react';
import logo from './logo.svg';
import './App.css';


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


  people.map(person => {
    return person.age = 41;
  })




  return (
    <div className="App">
      <h1>Nine By Four Api</h1>
      <h1>People Invited to my Party</h1>
    </div>
  );
}

export default App;
