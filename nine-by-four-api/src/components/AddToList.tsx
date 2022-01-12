import React, { useState } from 'react';
import { IState as Props } from "../App"

interface IProps {
    people: Props["people"]
    setPeople: React.Dispatch<React.SetStateAction<Props["people"]>>
}

const AddToList: React.FC<IProps> = ({ people, setPeople}) => {

    const [input, setInput] = useState({
        name: "",
        stageName: "",
        age: "",
        home: "",
        recordLabel: "",
        numberOfAlbums: "",
        albumName: "",
        note: "",
        img: ""

    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
        setInput({
            ...input,
            [e.target.name]: e.target.value
        })

    }

    const handleClick = (): void => {
        if(
            !input.name ||
            !input.age ||
            !input.stageName ||
            !input.img ||
            !input.home ||
            !input.recordLabel ||
            !input.numberOfAlbums ||
            !input.albumName
        ){
            return
        }

        setPeople([
            ...people,
            {
                name: input.name,
                age: parseInt(input.age),
                url: input.img,
                stageName: input.stageName,
                home: input.home,
                recordLabel: input.recordLabel,
                numberOfAlbums: parseInt(input.numberOfAlbums),
                albumName: input.albumName,
                note: input.note
            }

        ]);

        setInput({
            name: "",
            stageName: "",
            age: "",
            home: "",
            recordLabel: "",
            numberOfAlbums: "",
            albumName: "",
            note: "",
            img: ""
        })
    }

    return (
        <div className='AddToList'>
            <input 
                type="text"
                placeholder='Name'
                className='AddToList-input'
                value={input.name}
                onChange={handleChange}
                name='name'        
            />
            <input 
                type="text"
                placeholder='Stage Name'
                className='AddToList-input'
                value={input.stageName}
                onChange={handleChange}
                name='stageName'      
            />
            <input 
                type="text"
                placeholder='Age'
                className='AddToList-input' 
                value={input.age}        
                onChange={handleChange}
                name='age'      
            />
            <input 
                type="text"
                placeholder='Image Url'
                className='AddToList-input'
                value={input.img}        
                onChange={handleChange}
                name='img'       
            />
            <input 
                type="text"
                placeholder='Home'
                className='AddToList-input'
                value={input.home}       
                onChange={handleChange}
                name='home'        
            />
            <input 
                type="text"
                placeholder='Record Label'
                className='AddToList-input'
                value={input.recordLabel}
                onChange={handleChange}
                name='recordLabel'               
            />
            <input 
                type="text"
                placeholder='Number of Albums'
                className='AddToList-input'
                value={input.numberOfAlbums}
                onChange={handleChange}
                name='numberOfAlbums'               
            />
            <input 
                type="text"
                placeholder='Album Name'
                className='AddToList-input'
                value={input.albumName}  
                onChange={handleChange} 
                name='albumName'           
            />
            <textarea 
            
                placeholder='Notes'
                className='AddToList-input'
                value={input.note}       
                onChange={handleChange}  
                name='Note'     
            />
            <button 
                className='AddToList-btn'
                onClick={handleClick}
                            
            >
                Add to List

            </button>
        </div>
    )
}


export default AddToList;