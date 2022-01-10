import React from 'react';


interface IProps {
    people: {
      name: string
      stageName: string
        url: string
        age: number
        home: string
        recordLabel: string
        numberOfAlbums: number
        albumName: string
        releaseDate: Date
        diamondCert: boolean
        notes?: string
    }[]
  }

const List: React.FC<IProps> = ({ people }) => {
    return (
        <div>
            I am a list
        </div>
    )
}

export default List;