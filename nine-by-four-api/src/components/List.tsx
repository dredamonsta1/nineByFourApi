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
        // releaseDate: Date
        // diamondCert: boolean
        note?: string
    }[]
  }

const List: React.FC<IProps> = ({ people }) => {

    const renderList = (): JSX.Element[] => {
        return people.map((person) => {
            return (
                <li className='List'>
                <div className='List-header'>
                    <img className='List-img' src={person.url} alt='img'/>
                    <h2>{person.name}</h2>
                    </div>
                        <p>{person.stageName}</p>
                        <p>{person.age} years old</p>
                        <p>{person.home}</p>
                        <p>{person.recordLabel}</p>
                        <p>{person.numberOfAlbums}</p>
                        <p>{person.albumName}</p>
                        <p className='Liat-note'>{person.note}</p>
                </li>
            )
        })

    }

    return (
        <ul>
            {renderList()}
        </ul>
    )
}

export default List;