import React from 'react';



const AddToList = () => {
    return (
        <div className='AddToList'>
            <input 
                type="text"
                placeholder='Name'
                className='AddToList-input'            
            />
            <input 
                type="text"
                placeholder='Stage Name'
                className='AddToList-input'            
            />
            <input 
                type="text"
                placeholder='Age'
                className='AddToList-input'            
            />
            <input 
                type="text"
                placeholder='Image Url'
                className='AddToList-input'            
            />
            <input 
                type="text"
                placeholder='Home'
                className='AddToList-input'            
            />
            <input 
                type="text"
                placeholder='Record Label'
                className='AddToList-input'            
            />
            <input 
                type="text"
                placeholder='Number of Albums'
                className='AddToList-input'            
            />
            <input 
                type="text"
                placeholder='Album Name'
                className='AddToList-input'            
            />
            <textarea 
            
                placeholder='Note'
                className='AddToList-input'            
            />
            <input 
                type="submit"
                placeholder='name'
                className='AddToList-input'            
            />
        </div>
    )
}


export default AddToList;